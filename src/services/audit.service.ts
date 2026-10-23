import { prisma } from '../db/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AuditAction, AuditModule } from '../generated/prisma/client.js';
import type { ListAuditLogsQuery } from '../validators/audit.validators.js';

type Db = Prisma.TransactionClient | typeof prisma;

export type AuditEntry = {
  action: AuditAction;
  module: AuditModule;
  entityId?: string | null | undefined;
  actor: { id?: string | null | undefined; email: string };
  // Field diff ({ field: { from, to } }) or small metadata. Never put secrets here.
  changes?: Prisma.InputJsonObject | null | undefined;
};

// Pass the transaction client when recording next to a business write, so the entry commits or
// rolls back together with it.
export async function recordAudit(db: Db, entry: AuditEntry) {
  await db.auditLog.create({
    data: {
      action: entry.action,
      module: entry.module,
      entityId: entry.entityId ?? null,
      actorId: entry.actor.id ?? null,
      actorEmail: entry.actor.email,
      changes: entry.changes ?? Prisma.DbNull,
    },
  });
}

// For events recorded outside a transaction (failed logins, emails). An audit failure must never
// break the request, so it is logged and swallowed.
export async function recordAuditSafe(entry: AuditEntry) {
  try {
    await recordAudit(prisma, entry);
  } catch (err) {
    console.error('Failed to write audit log', err);
  }
}

// { field: { from, to } } for the listed fields whose value changed; empty when nothing did.
export function diffFields<T extends Record<string, unknown>>(before: T, after: T, fields: (keyof T & string)[]) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of fields) {
    if (JSON.stringify(before[f]) !== JSON.stringify(after[f])) changes[f] = { from: before[f], to: after[f] };
  }
  return changes as Prisma.InputJsonObject;
}

export async function listAuditLogs({ page, limit, module, action, actorId, search, from, to }: ListAuditLogsQuery) {
  const where: Prisma.AuditLogWhereInput = {
    ...(module && { module }),
    ...(action && { action }),
    ...(actorId && { actorId }),
    ...(search && { actorEmail: { contains: search, mode: 'insensitive' } }),
    ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
  };
  const [total, logs] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        action: true,
        module: true,
        entityId: true,
        actorId: true,
        actorEmail: true,
        changes: true,
        createdAt: true,
        actor: { select: { name: true, role: { select: { name: true } } } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return {
    logs: logs.map(({ actor, ...l }) => ({
      ...l,
      actorName: actor?.name ?? null,
      actorRole: actor?.role.name ?? null,
    })),
    page,
    limit,
    total,
  };
}
