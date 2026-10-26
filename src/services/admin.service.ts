import { prisma } from '../db/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/AppError.js';
import type { AuthUser } from '../types/express.js';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../utils/password.js';
import { recordAudit } from './audit.service.js';
import { createPasswordResetLink } from './auth.service.js';
import { staffWelcomeEmail } from './email/templates/index.js';
import { sendEmailSafe } from './email/email.service.js';
import type {
  CreateClientInput,
  CreateStaffInput,
  GrantClientAccessInput,
  ListClientsQuery,
  ListUsersQuery,
} from '../validators/admin.validators.js';

// Staff set their own password through the emailed link, so the initial one is random and never shared.
const STAFF_WELCOME_LINK_EXPIRY_MINUTES = 72 * 60;

const userSelect = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  role: { select: { name: true } },
  permissions: { select: { client: { select: { id: true, name: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

const toUserDto = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role.name,
  createdAt: u.createdAt,
  clients: u.permissions.map((p) => p.client).sort((a, b) => a.name.localeCompare(b.name)),
});

export async function listUsers({ page, limit, search, role, excludeAdmin, clientId }: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(role && { role: { name: role } }),
    ...(excludeAdmin && { role: { name: role ?? { not: 'SUPER_ADMIN' } } }),
    ...(clientId && { permissions: { some: { clientId } } }),
  };
  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { users: users.map(toUserDto), page, limit, total };
}

const clientAccessSelect = {
  id: true,
  name: true,
  permissions: {
    select: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { user: { email: 'asc' } },
  },
} satisfies Prisma.ClientSelect;

type ClientAccessRow = Prisma.ClientGetPayload<{ select: typeof clientAccessSelect }>;

const toClientAccessDto = (c: ClientAccessRow) => {
  const users = c.permissions.map((p) => p.user);
  return { id: c.id, name: c.name, userCount: users.length, users };
};

export async function listClients({ page, limit, search }: ListClientsQuery) {
  const where: Prisma.ClientWhereInput = search ? { name: { contains: search, mode: 'insensitive' } } : {};
  const [total, clients] = await prisma.$transaction([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { clients, page, limit, total };
}

export async function createClient(actor: AuthUser, { name }: CreateClientInput) {
  try {
    const client = await prisma.$transaction(async (tx) => {
      const created = await tx.client.create({ data: { name }, select: clientAccessSelect });
      await recordAudit(tx, {
        action: 'CREATE',
        module: 'CLIENT',
        entityId: created.id,
        actor,
        changes: { name },
      });
      return created;
    });
    return toClientAccessDto(client);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'CONFLICT', 'A client with that name already exists');
    }
    throw err;
  }
}

async function loadClientAccess(clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: clientAccessSelect });
  if (!client) throw new AppError(404, 'NOT_FOUND', 'Client not found');
  return toClientAccessDto(client);
}

// Idempotent: granting an existing grant is a no-op.
export async function grantClientAccess(
  actor: AuthUser,
  clientId: string,
  { email }: GrantClientAccessInput,
) {
  await loadClientAccess(clientId);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new AppError(404, 'NOT_FOUND', 'No user with that email');

  await prisma.$transaction(async (tx) => {
    const existing = await tx.clientPermission.findUnique({
      where: { userId_clientId: { userId: user.id, clientId } },
    });
    if (existing) return; // idempotent: nothing changed, nothing to audit
    await tx.clientPermission.create({ data: { userId: user.id, clientId } });
    await recordAudit(tx, {
      action: 'GRANT_ACCESS',
      module: 'CLIENT_ACCESS',
      entityId: clientId,
      actor,
      changes: { userId: user.id, email },
    });
  });
  return loadClientAccess(clientId);
}

// Idempotent: revoking a missing grant is a no-op.
export async function revokeClientAccess(actor: AuthUser, clientId: string, userId: string) {
  await loadClientAccess(clientId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.clientPermission.deleteMany({ where: { clientId, userId } });
    if (count === 0) return; // idempotent: nothing changed, nothing to audit
    await recordAudit(tx, {
      action: 'REVOKE_ACCESS',
      module: 'CLIENT_ACCESS',
      entityId: clientId,
      actor,
      changes: { userId },
    });
  });
  return loadClientAccess(clientId);
}

export async function createStaff(actor: AuthUser, input: CreateStaffInput) {
  const role = await prisma.role.findUnique({ where: { name: input.role } });
  if (!role) throw new Error(`Role ${input.role} is missing; run the seed`);

  try {
    const passwordHash = await hashPassword(randomBytes(32).toString('hex'));
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          name: input.name ?? input.email.split('@')[0]!,
          roleId: role.id,
          passwordHash,
        },
        select: userSelect,
      });
      // The password is deliberately not recorded.
      await recordAudit(tx, {
        action: 'CREATE',
        module: 'USER',
        entityId: created.id,
        actor,
        changes: { email: created.email, name: created.name, role: created.role.name },
      });
      return created;
    });

    const resetUrl = await createPasswordResetLink(user.id, STAFF_WELCOME_LINK_EXPIRY_MINUTES);
    sendEmailSafe({
      to: user.email,
      ...staffWelcomeEmail({
        name: user.name,
        role: user.role.name,
        resetUrl,
        expiresInHours: STAFF_WELCOME_LINK_EXPIRY_MINUTES / 60,
      }),
    });
    return toUserDto(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'CONFLICT', 'Email already registered');
    }
    throw err;
  }
}
