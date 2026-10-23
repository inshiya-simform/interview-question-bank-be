import { z } from 'zod';

const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'APPROVE',
  'REJECT',
  'REQUEST_CHANGES',
  'GRANT_ACCESS',
  'REVOKE_ACCESS',
  'LOGIN',
  'LOGIN_FAILED',
  'REGISTER',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET',
  'IMPORT',
  'EXPORT',
] as const;

const AUDIT_MODULES = ['AUTH', 'USER', 'CLIENT', 'CLIENT_ACCESS', 'QUESTION'] as const;

export const listAuditLogsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    module: z.enum(AUDIT_MODULES).optional(),
    action: z.enum(AUDIT_ACTIONS).optional(),
    actorId: z.uuid().optional(),
    // matches the actor's email
    search: z.string().trim().min(1).max(200).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict();

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
