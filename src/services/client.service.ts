import { prisma } from '../db/prisma.js';
import type { AuthUser } from '../types/express.js';

export async function listPermittedClients(user: AuthUser) {
  const clients = await prisma.client.findMany({
    // Reviewers (question:review) have access to every client; others only those they hold a grant on.
    where: user.permissions.includes('question:review') ? {} : { permissions: { some: { userId: user.id } } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return { clients };
}
