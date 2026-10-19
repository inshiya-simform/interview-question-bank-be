-- Remove the AUTHOR role: USER takes over its permissions (question:create, question:edit_own).
-- Existing authors become users; their questions keep the same authorId.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('question:create', 'question:edit_own')
WHERE r."name" = 'USER'
ON CONFLICT DO NOTHING;

UPDATE "User"
SET "roleId" = (SELECT "id" FROM "Role" WHERE "name" = 'USER')
WHERE "roleId" = (SELECT "id" FROM "Role" WHERE "name" = 'AUTHOR');

-- RolePermission rows cascade
DELETE FROM "Role" WHERE "name" = 'AUTHOR';
