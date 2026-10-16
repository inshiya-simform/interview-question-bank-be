-- SUPER_ADMIN role and its permissions. Production only runs `prisma migrate deploy`
-- (no seed), so this reference data must live in a migration. Idempotent.
INSERT INTO "Role" ("name") VALUES ('SUPER_ADMIN') ON CONFLICT ("name") DO NOTHING;

INSERT INTO "Permission" ("code")
VALUES ('user:read'), ('user:create_staff'), ('client:read_all'), ('client:assign')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('user:read', 'user:create_staff', 'client:read_all', 'client:assign')
WHERE r."name" = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;
