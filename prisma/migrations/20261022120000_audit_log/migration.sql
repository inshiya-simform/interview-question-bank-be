-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'REQUEST_CHANGES', 'GRANT_ACCESS', 'REVOKE_ACCESS', 'LOGIN', 'LOGIN_FAILED', 'REGISTER', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET', 'IMPORT', 'EXPORT');

-- CreateEnum
CREATE TYPE "AuditModule" AS ENUM ('AUTH', 'USER', 'CLIENT', 'CLIENT_ACCESS', 'QUESTION');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "module" "AuditModule" NOT NULL,
    "entityId" TEXT,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_module_createdAt_idx" ON "AuditLog"("module", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- audit:read for SUPER_ADMIN. Idempotent; see the super_admin_role migration for why this is a migration.
INSERT INTO "Permission" ("code") VALUES ('audit:read') ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" = 'audit:read'
WHERE r."name" = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;
