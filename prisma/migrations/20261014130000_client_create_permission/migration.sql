-- client:create for SUPER_ADMIN. Idempotent; see the super_admin_role migration for why this is a migration.
INSERT INTO "Permission" ("code") VALUES ('client:create') ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" = 'client:create'
WHERE r."name" = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;
