import { prisma } from '../db/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/express.js';
import { AppError } from '../utils/AppError.js';
import { signToken } from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import type { LoginInput, RegisterInput } from '../validators/auth.validators.js';

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
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
        roleId: role.id,
      },
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
  if (!user || !valid) throw new AppError(401, 'UNAUTHENTICATED', 'Invalid email or password');

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
