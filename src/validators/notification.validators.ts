import { z } from 'zod';

export const listNotificationsQuerySchema = z
  .object({
    status: z.enum(['all', 'unread']).default('all'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const notificationIdParamSchema = z.object({ id: z.uuid() });

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
