import { z } from 'zod';

export const STAFF_ROLES = ['REVIEWER'] as const;

export const createStaffSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    // The UI only collects email + role; defaults to the email's local part
    name: z.string().trim().min(1).max(100).optional(),
    role: z.enum(STAFF_ROLES),
  })
  .strict();

export const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    // matches user name or email
    search: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const listClientAccessQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    // matches client name or the email of a user with access
    search: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const grantClientAccessSchema = z
  .object({ email: z.string().trim().toLowerCase().pipe(z.email()) })
  .strict();

export const createClientSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();

export const clientIdParamSchema = z.object({ clientId: z.uuid() });
export const clientUserParamSchema = z.object({ clientId: z.uuid(), userId: z.uuid() });

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type ListClientAccessQuery = z.infer<typeof listClientAccessQuerySchema>;
export type GrantClientAccessInput = z.infer<typeof grantClientAccessSchema>;
