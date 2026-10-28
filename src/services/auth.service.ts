import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { recordAudit, recordAuditSafe } from './audit.service.js';
import { passwordChangedEmail, passwordResetEmail, welcomeEmail } from './email/templates/index.js';
import { sendEmailSafe } from './email/email.service.js';
import { closeUser } from './notification/notification.hub.js';
import type { AuthUser } from '../types/express.js';
import { AppError } from '../utils/AppError.js';
import { signToken } from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyResetTokenInput,
} from '../validators/auth.validators.js';

const DEFAULT_ROLE = 'USER';

// Compared against when the email is unknown so response time doesn't reveal which emails exist.
const DUMMY_HASH = '$2b$10$mgnFPfc1WD53UsZqeqGkVuL3w4SmUlfCTMdJPyi9RerxqRuDHrtzG';

const authInclude = {
  role: { include: { permissions: { include: { permission: true } } } },
  permissions: { include: { client: true } },
} satisfies Prisma.UserInclude;

type UserWithAuth = Prisma.UserGetPayload<{ include: typeof authInclude }>;

const toAuthUser = (user: UserWithAuth): AuthUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role.name,
  permissions: user.role.permissions.map((rp) => rp.permission.code),
  clientIds: user.permissions.map((cp) => cp.clientId),
});

// issuedAt (ms) is the token's iat; a token older than the last password change is revoked.
export async function loadAuthUser(userId: string, issuedAt?: number): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: authInclude });
  if (!user) return null;
  if (
    issuedAt !== undefined &&
    user.passwordChangedAt &&
    issuedAt < Math.floor(user.passwordChangedAt.getTime() / 1000) * 1000
  ) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Session expired, please log in again');
  }
  return toAuthUser(user);
}

const hashRefreshToken = (token: string) => createHash('sha256').update(token).digest('hex');

type Db = Prisma.TransactionClient | typeof prisma;

// Starts a new family unless one is given (rotation keeps the family). Returns the raw token and its row id.
async function issueRefreshToken(db: Db, userId: string, familyId: string = randomUUID()) {
  const token = randomBytes(32).toString('hex');
  const row = await db.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(Date.now() + env.refreshTokenExpiresInDays * 24 * 60 * 60_000),
    },
  });
  return { token, id: row.id };
}

const issueSession = async (userId: string) => ({
  token: signToken(userId),
  refreshToken: (await issueRefreshToken(prisma, userId)).token,
});

const revokeFamily = (familyId: string) =>
  prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

const revokeAllRefreshTokens = (userId: string) =>
  prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

export async function register(input: RegisterInput) {
  const role = await prisma.role.findUnique({ where: { name: DEFAULT_ROLE } });
  if (!role) throw new Error(`Role ${DEFAULT_ROLE} is missing; run the seed`);

  try {
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash, roleId: role.id },
      });
      await recordAudit(tx, {
        action: 'REGISTER',
        module: 'AUTH',
        entityId: created.id,
        actor: created,
        changes: { email: created.email, name: created.name, role: role.name },
      });
      return created;
    });
    sendEmailSafe({ to: user.email, ...welcomeEmail({ name: user.name }) });
    return {
      user: { id: user.id, email: user.email, name: user.name, role: role.name },
      ...(await issueSession(user.id)),
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'CONFLICT', 'Email already registered');
    }
    throw err;
  }
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { role: true },
  });
  const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    await recordAuditSafe({
      action: 'LOGIN_FAILED',
      module: 'AUTH',
      entityId: user?.id,
      actor: { id: user?.id, email: input.email },
    });
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid email or password');
  }

  await recordAuditSafe({
    action: 'LOGIN',
    module: 'AUTH',
    entityId: user.id,
    actor: user,
  });
  return {
    ...(await issueSession(user.id)),
    user: { id: user.id, email: user.email, name: user.name, role: user.role.name },
  };
}

const invalidRefreshToken = () => new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired refresh token');

export async function refresh(input: RefreshInput) {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(input.refreshToken) },
    include: { user: true },
  });
  if (!record) throw invalidRefreshToken();

  if (record.revokedAt) {
    // A rotated token coming back means it was copied; kill every session descended from it.
    await revokeFamily(record.familyId);
    throw invalidRefreshToken();
  }
  if (record.expiresAt <= new Date()) throw invalidRefreshToken();

  const changedAt = record.user.passwordChangedAt;
  if (changedAt && record.createdAt < new Date(Math.floor(changedAt.getTime() / 1000) * 1000)) {
    throw invalidRefreshToken();
  }

  const refreshToken = await prisma.$transaction(async (tx) => {
    // Conditional update makes rotation atomic if the same token is submitted twice at once.
    const consumed = await tx.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (consumed.count === 0) throw invalidRefreshToken();
    const next = await issueRefreshToken(tx, record.userId, record.familyId);
    await tx.refreshToken.update({ where: { id: record.id }, data: { replacedById: next.id } });
    return next.token;
  });

  return { token: signToken(record.userId), refreshToken };
}

// Always succeeds so the response never reveals whether a token was valid.
export async function logout(input: LogoutInput) {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(input.refreshToken) },
  });
  if (record) await revokeFamily(record.familyId);
  return { message: 'Logged out' };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: authInclude });
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'User no longer exists');

  const auth = toAuthUser(user);
  return {
    id: auth.id,
    email: auth.email,
    name: auth.name,
    role: auth.role,
    permissions: auth.permissions,
    clients: user.permissions.map((cp) => ({ id: cp.client.id, name: cp.client.name })),
  };
}

const hashResetToken = (token: string) => createHash('sha256').update(token).digest('hex');

// Always resolves the same way so the response never reveals whether an email is registered.
// Replaces any unused reset tokens for the user and returns the frontend link for a fresh one.
export async function createPasswordResetLink(userId: string, expiresInMinutes: number) {
  const token = randomBytes(32).toString('hex');

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(Date.now() + expiresInMinutes * 60_000),
      },
    }),
  ]);

  return `${env.frontendUrl.replace(/\/$/, '')}/reset-password?token=${token}`;
}

export async function forgotPassword(input: ForgotPasswordInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (user) {
    const expiresInMinutes = env.passwordResetExpiryMinutes;
    const resetUrl = await createPasswordResetLink(user.id, expiresInMinutes);

    await recordAuditSafe({
      action: 'PASSWORD_RESET_REQUESTED',
      module: 'AUTH',
      entityId: user.id,
      actor: user,
    });

    sendEmailSafe({
      to: user.email,
      ...passwordResetEmail({ name: user.name, resetUrl, expiresInMinutes }),
    });
  }
  return { message: 'If an account exists for that email, a password reset link has been sent.' };
}

const invalidResetLink = () => new AppError(400, 'VALIDATION_ERROR', 'Invalid or expired reset link');

async function findUsableResetToken(token: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) throw invalidResetLink();
  return record;
}

// Lets the frontend refuse to show the reset form for a used, expired or unknown link.
export async function verifyResetToken(input: VerifyResetTokenInput) {
  await findUsableResetToken(input.token);
  return { valid: true };
}

export async function resetPassword(input: ResetPasswordInput) {
  const record = await findUsableResetToken(input.token);

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.$transaction(async (tx) => {
    // Conditional update makes consumption atomic if the same link is submitted twice at once.
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 0) throw invalidResetLink();
    const user = await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, passwordChangedAt: new Date() },
    });
    // The new hash is deliberately not recorded.
    await recordAudit(tx, {
      action: 'PASSWORD_RESET',
      module: 'AUTH',
      entityId: user.id,
      actor: user,
    });
    return user;
  });

  await revokeAllRefreshTokens(user.id);
  sendEmailSafe({ to: user.email, ...passwordChangedEmail({ name: user.name }) });
  closeUser(user.id); // existing sessions are revoked, so their open streams end too
  return { message: 'Password has been reset. You can now log in.' };
}

export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'User no longer exists');
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Current password is incorrect');
  }

  const passwordHash = await hashPassword(input.password);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, passwordChangedAt: new Date() },
  });

  await revokeAllRefreshTokens(userId);
  sendEmailSafe({ to: user.email, ...passwordChangedEmail({ name: user.name }) });
  closeUser(user.id); // existing sessions are revoked, so their open streams end too

  // Other sessions are now revoked; hand back a fresh pair so this one stays signed in.
  return { ...(await issueSession(userId)), message: 'Password changed' };
}
