# Step 1: Database foundation (Prisma, Postgres, seed, RBAC tables)

Retrospective plan: records what was built for Step 1 and why, so later steps can rely on it. Status: **done**.

## Context
README §13 step 1 asks for the Prisma schema, migrations (tsvector, pg_trgm, indexes) and a seed. The core hard case of the POC is that client-restricted questions must never leak through search, so the schema and indexes are shaped to let visibility, filters and keyword search run in one SQL statement.

## Decisions
- **Prisma 7.10 (stable).** The npm `latest` tag for the CLI points at an 8.0 release candidate, so versions are pinned to 7.10.0 (`prisma`, `@prisma/client`, `@prisma/adapter-pg`). Prisma 7 needs `prisma.config.ts` (datasource URL, seed command) and a driver adapter (`pg`).
- **Generated client** goes to `src/generated/prisma` (gitignored; `postinstall` runs `prisma generate`).
- **Postgres 16 via Docker Compose**, host port **5434** (5432 and 5433 were already in use on the dev machine).
- **Roles and permissions are data.** `Role`, `Permission`, `RolePermission` tables replace a `Role` enum, so changing access or adding a role is a data change. Client visibility stays out of this model: it lives in `ClientPermission` and the query's `WHERE` clause.
  - AUTHOR: `question:read`, `question:create`, `question:edit_own`
  - REVIEWER: `question:read`, `question:edit_any` (cannot add)
  - USER: `question:read`
- **Raw-SQL-only parts live in migration SQL**, because Prisma cannot express them:
  - `pg_trgm` extension
  - `Question.searchVector`: `tsvector GENERATED ALWAYS AS (to_tsvector('english', text || ' ' || answerNotes)) STORED`, declared in the schema as `Unsupported("tsvector")?`
  - GIN index on `searchVector`; trigram GIN index on `normalizedText` (both declared in the schema via `@@index(..., type: Gin)` so Prisma does not see them as drift)
- **`QuestionTag.categoryId` integrity:** composite FK `QuestionTag(tagId, categoryId)` to `Tag(id, categoryId)` (via `@@unique([id, categoryId])` on `Tag`), so the denormalised column can never disagree with the tag's category.

## Deliverables
- `docker-compose.yml`: Postgres with healthcheck, named volume.
- `prisma/schema.prisma`: User, Role, Permission, RolePermission, Client, ClientPermission, TagCategory, Tag, Question, QuestionTag, QuestionHistory.
- Migrations:
  - `20261009093805_init`: tables, extension, generated column, indexes.
  - `20261009100000_role_permission_tables`: RBAC tables; renames the old `Role` enum out of the way (it clashes with the new table's row type), backfills `User.roleId`, drops the old column and enum. Written by hand to preserve existing rows.
- `prisma.config.ts`, `src/db/prisma.ts` (client singleton with the pg adapter), `src/utils/normalize.ts` (`normalizeText`).
- `src/config/env.ts`: `DATABASE_URL` required. `.env.example` documents it.
- `prisma/seed.ts` (idempotent upserts): roles/permissions map, 5 users (2 authors, reviewer, user, `acme-user`), clients Acme and Globex, one Acme grant (only `acme-user`), 3 tag categories, 5 sample questions (2 client-restricted) with history rows. All users use password `password123`.
- npm scripts: `db:up`, `prisma:generate`, `prisma:migrate`, `prisma:deploy`, `prisma:seed`.
- README §1 and §3 updated for the RBAC model.

## Verification (all passed)
1. `npm run db:up` brings Postgres up healthy.
2. `npx prisma migrate deploy` applies both migrations; `migrate status` reports up to date.
3. `npx prisma db seed` run twice leaves 5 questions (idempotent).
4. Full-text: `searchVector @@ websearch_to_tsquery('english','event loop')` finds the Node event-loop question.
5. Trigram: `similarity()` of two near-duplicate phrasings is 0.82, above the 0.8 threshold.
6. All 8 expected indexes exist; `\d "QuestionTag"` shows the composite FK.
7. Role/permission counts per seeded user are correct (authors 3, reviewer 2, users 1).
8. `npx tsc --noEmit` passes (tsconfig `include` limited to `src`).

## Known caveats
- `prisma migrate diff` always reports `ALTER COLUMN "searchVector" DROP DEFAULT`; Prisma cannot model generated columns. Generate future migrations with `--create-only` and remove that line.
- `prisma migrate dev` hangs in a non-interactive shell; use `migrate deploy` or `--create-only`.
- `prisma migrate reset` is blocked for AI agents without explicit user consent. It was not needed.

## Open items carried forward
- README §5 still gates taxonomy-management and client grant/revoke routes as "reviewer", but REVIEWER has no permission for them. Decide on permissions such as `taxonomy:manage` and `client:grant` (proposed: both to REVIEWER) before those routes are built.
- The 10k-question performance seed and `EXPLAIN` write-up belong to build-order step 8, not here.
