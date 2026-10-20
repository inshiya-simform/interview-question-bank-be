import { prisma } from '../db/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { hashPassword } from '../utils/password.js';
import type {
  CreateClientInput,
  CreateStaffInput,
  GrantClientAccessInput,
  ListClientAccessQuery,
  ListUsersQuery,
} from '../validators/admin.validators.js';

// Staff accounts start with this password; the super admin hands it over out of band.
const DEFAULT_STAFF_PASSWORD = 'password123';

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

export async function listUsers({ page, limit, search, role, excludeAdmin }: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(role && { role: { name: role } }),
    ...(excludeAdmin && { role: { name: role ?? { not: 'SUPER_ADMIN' } } }),
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

export async function listClientAccess({ page, limit, search }: ListClientAccessQuery) {
  const where: Prisma.ClientWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { permissions: { some: { user: { email: { contains: search, mode: 'insensitive' } } } } },
        ],
      }
    : {};
  const [total, rows] = await prisma.$transaction([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      select: clientAccessSelect,
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { clients: rows.map(toClientAccessDto), page, limit, total };
}

export async function createClient({ name }: CreateClientInput) {
  try {
    return toClientAccessDto(await prisma.client.create({ data: { name }, select: clientAccessSelect }));
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
export async function grantClientAccess(clientId: string, { email }: GrantClientAccessInput) {
  await loadClientAccess(clientId);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new AppError(404, 'NOT_FOUND', 'No user with that email');

  await prisma.clientPermission.upsert({
    where: { userId_clientId: { userId: user.id, clientId } },
    update: {},
    create: { userId: user.id, clientId },
  });
  return loadClientAccess(clientId);
}

// Idempotent: revoking a missing grant is a no-op.
export async function revokeClientAccess(clientId: string, userId: string) {
  await loadClientAccess(clientId);
  await prisma.clientPermission.deleteMany({ where: { clientId, userId } });
  return loadClientAccess(clientId);
}

export async function createStaff(input: CreateStaffInput) {
  const role = await prisma.role.findUnique({ where: { name: input.role } });
  if (!role) throw new Error(`Role ${input.role} is missing; run the seed`);

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name ?? input.email.split('@')[0]!,
        roleId: role.id,
        passwordHash: await hashPassword(DEFAULT_STAFF_PASSWORD),
      },
      select: userSelect,
    });
    return toUserDto(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'CONFLICT', 'Email already registered');
    }
    throw err;
  }
}
