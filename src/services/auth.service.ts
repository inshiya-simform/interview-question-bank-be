import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { recordAudit, recordAuditSafe } from './audit.service.js';
import { passwordResetEmail } from './email/templates/index.js';
import { sendEmailSafe } from './email/email.service.js';
import type { AuthUser } from '../types/express.js';
import { AppError } from '../utils/AppError.js';
import { signToken } from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import type {
  ForgotPasswordInput,
  LoginInput,
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

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: authInclude });
  return user ? toAuthUser(user) : null;
}

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
    return {
      user: { id: user.id, email: user.email, name: user.name, role: role.name },
      token: signToken(user.id),
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
    token: signToken(user.id),
    user: { id: user.id, email: user.email, name: user.name, role: user.role.name },
  };
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
export async function forgotPassword(input: ForgotPasswordInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (user) {
    const token = randomBytes(32).toString('hex');
    const expiresInMinutes = env.passwordResetExpiryMinutes;

    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashResetToken(token),
          expiresAt: new Date(Date.now() + expiresInMinutes * 60_000),
        },
      }),
    ]);

    await recordAuditSafe({
      action: 'PASSWORD_RESET_REQUESTED',
      module: 'AUTH',
      entityId: user.id,
      actor: user,
    });

    const resetUrl = `${env.frontendUrl.replace(/\/$/, '')}/reset-password?token=${token}`;
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
  await prisma.$transaction(async (tx) => {
    // Conditional update makes consumption atomic if the same link is submitted twice at once.
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 0) throw invalidResetLink();
    const user = await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    // The new hash is deliberately not recorded.
    await recordAudit(tx, {
      action: 'PASSWORD_RESET',
      module: 'AUTH',
      entityId: user.id,
      actor: user,
    });
  });

  return { message: 'Password has been reset. You can now log in.' };
}
