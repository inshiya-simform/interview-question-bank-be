import { PURGE_INTERVAL_MS, READ_RETENTION_MS } from '../constants/notification.constants.js';
import { prisma } from '../db/prisma.js';
import type { NotificationType, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/express.js';
import { AppError } from '../utils/AppError.js';
import type { ListNotificationsQuery } from '../validators/notification.validators.js';
import * as hub from './notification/notification.hub.js';

export interface NotifyInput {
  type: NotificationType;
  data: Prisma.InputJsonObject;
}

const notificationSelect = { id: true, type: true, data: true, readAt: true, createdAt: true } as const;

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

function toDto(n: NotificationRow) {
  return { id: n.id, type: n.type, data: n.data, read: n.readAt !== null, createdAt: n.createdAt };
}

// Stores the notification for each recipient, then pushes it to whoever is connected. Call it after
// the originating transaction commits. Like sendEmailSafe it never throws, so a failure here can't
// fail the request that caused it.
export async function notify(userIds: Iterable<string>, { type, data }: NotifyInput): Promise<void> {
  const recipients = [...new Set(userIds)];
  if (recipients.length === 0) return;
  try {
    const created = await prisma.notification.createManyAndReturn({
      data: recipients.map((userId) => ({ userId, type, data })),
      select: { ...notificationSelect, userId: true },
    });
    for (const { userId, ...n } of created) hub.publish(userId, 'notification', toDto(n));
  } catch (err) {
    console.error(JSON.stringify({ event: 'notify_failed', type, error: String(err) }));
  }
}

// Reviewers who may see a question of this client (unrestricted questions: every reviewer).
export async function reviewerIdsFor(clientId: string | null, excludeUserId?: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      ...(excludeUserId && { id: { not: excludeUserId } }),
      role: { permissions: { some: { permission: { code: 'question:review' } } } },
      ...(clientId && { permissions: { some: { clientId } } }),
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export async function clientMemberIds(clientId: string, excludeUserIds: string[]): Promise<string[]> {
  const grants = await prisma.clientPermission.findMany({
    where: { clientId, userId: { notIn: excludeUserIds } },
    select: { userId: true },
  });
  return grants.map((g) => g.userId);
}

export async function listNotifications(user: AuthUser, { status, page, limit }: ListNotificationsQuery) {
  const where: Prisma.NotificationWhereInput = { userId: user.id, ...(status === 'unread' && { readAt: null }) };
  const [total, unreadCount, items] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.findMany({
      where,
      select: notificationSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { items: items.map(toDto), page, limit, total, unreadCount };
}

export async function unreadCount(user: AuthUser) {
  return { unreadCount: await prisma.notification.count({ where: { userId: user.id, readAt: null } }) };
}

// Idempotent: marking an already read notification keeps its original read time.
export async function markRead(user: AuthUser, id: string) {
  const existing = await prisma.notification.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Notification not found');
  await prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return unreadCount(user);
}

export async function markAllRead(user: AuthUser) {
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return { unreadCount: 0 };
}

async function purgeOldNotifications(): Promise<number> {
  const { count } = await prisma.notification.deleteMany({
    where: { readAt: { lt: new Date(Date.now() - READ_RETENTION_MS) } },
  });
  return count;
}

// Starts the SSE heartbeat and a daily sweep of old read notifications.
export function startNotifications(): void {
  hub.startHeartbeat();
  const run = () =>
    purgeOldNotifications().catch((err) =>
      console.error(JSON.stringify({ event: 'notification_purge_failed', error: String(err) })),
    );
  void run();
  setInterval(run, PURGE_INTERVAL_MS).unref();
}
