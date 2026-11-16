ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- user:manage for SUPER_ADMIN. Idempotent; see the super_admin_role migration for why this is a migration.
INSERT INTO "Permission" ("code") VALUES ('user:manage') ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" = 'user:manage'
WHERE r."name" = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;
