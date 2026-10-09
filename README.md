# Interview Question Bank — Backend

Shared, searchable bank of interview/screening questions. Anyone can browse questions they're permitted to see; authors add and edit their own; reviewers edit anything; questions tied to a client are visible only to users granted access to that client.

**Stack:** Node.js · Express 5 · TypeScript · Prisma · PostgreSQL · Docker Compose

> The core hard case of this POC is **authorization that doesn't leak through search**. A client-restricted question must be excluded *in the SQL query itself* — never fetched and filtered in application code — and a non-permitted search must be indistinguishable from a genuine zero-match.

---

## 1. Actors & permissions

| Role | Add | Edit | Read |
|---|---|---|---|
| `AUTHOR` | yes | own entries only | everything they're permitted to see |
| `REVIEWER` | yes | any entry | everything they're permitted to see |
| `USER` | no | no | everything they're permitted to see |

**Client permission** (`ClientPermission`): grants one user visibility into one client's questions. Independent of role — a Reviewer without a grant still cannot see a client's questions.

A question is **visible** to user `U` iff `question.clientId IS NULL` OR a `ClientPermission(U, question.clientId)` exists.

## 2. Functional requirements

1. **Add question** — text, answer notes, and multiple tags in each of several categories (technology, seniority, question type, …).
2. **Combined filter** — AND across categories, OR within a category (`technology ∈ {React, Node} AND seniority ∈ {Mid, Senior}`), executed in the database.
3. **Keyword search** — across question text and answer notes, combinable with filters.
4. **Client-restricted visibility** — enforced in the query. Applies to list, search, get-by-id, duplicate check, and any counts/facets.
5. **Edit permissions** — enforced by the API (not UI). Author → own only; Reviewer → any; User → none.
6. **Duplicate detection** — checked on submit; near-duplicates are surfaced, not silently stored.
7. **Change history** — every create/edit records who and when.
8. **No anonymous access** — every route except `/health` and `/auth/*` requires an authenticated user.

## 3. Data model (Prisma)

```prisma
enum Role { AUTHOR REVIEWER USER }
enum HistoryAction { CREATED UPDATED }

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  name         String
  passwordHash String
  role         Role     @default(USER)
  createdAt    DateTime @default(now())

  questions    Question[]          @relation("QuestionAuthor")
  permissions  ClientPermission[]
  history      QuestionHistory[]
}

model Client {
  id          String   @id @default(uuid())
  name        String   @unique
  permissions ClientPermission[]
  questions   Question[]
}

model ClientPermission {
  userId   String
  clientId String
  grantedAt DateTime @default(now())
  user     User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  client   Client @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@id([userId, clientId])
  @@index([clientId])
}

model TagCategory {
  id   Int    @id @default(autoincrement())
  slug String @unique            // technology | seniority | question-type | ...
  name String
  tags Tag[]
}

model Tag {
  id         Int    @id @default(autoincrement())
  categoryId Int
  slug       String
  name       String
  category   TagCategory @relation(fields: [categoryId], references: [id])
  questions  QuestionTag[]

  @@unique([categoryId, slug])
}

model Question {
  id             String   @id @default(uuid())
  text           String
  normalizedText String                       // lowercased, punctuation/whitespace-collapsed; used by duplicate check
  answerNotes    String
  clientId       String?                      // NULL = visible to all authenticated users
  authorId       String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  // + generated tsvector column `search_vector` (migration SQL, see §4)

  client  Client? @relation(fields: [clientId], references: [id])
  author  User    @relation("QuestionAuthor", fields: [authorId], references: [id])
  tags    QuestionTag[]
  history QuestionHistory[]

  @@index([clientId])
  @@index([authorId])
}

// Many-to-many join. categoryId is denormalised so a composite index can serve
// "category = X AND tag IN (...)" without joining Tag.
model QuestionTag {
  questionId String
  tagId      Int
  categoryId Int
  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  tag        Tag      @relation(fields: [tagId], references: [id])

  @@id([questionId, tagId])
  @@index([tagId, questionId])
  @@index([categoryId, tagId, questionId])
}

model QuestionHistory {
  id         String        @id @default(uuid())
  questionId String
  actorId    String
  action     HistoryAction
  changes    Json          // snapshot or before/after diff
  createdAt  DateTime      @default(now())
  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  actor      User     @relation(fields: [actorId], references: [id])

  @@index([questionId, createdAt])
}
```

Notes:
- `QuestionTag.categoryId` must match `Tag.categoryId` — enforce in the service and with a composite FK / check in the migration SQL.
- `clientId` is nullable on `Question` so "unrestricted" is a plain `IS NULL` predicate the planner can use.

## 4. Query design — filter + search + visibility as one SQL statement

Prisma's query builder can't express full-text search or per-category `EXISTS` cleanly, so list/search uses `prisma.$queryRaw` with **parameterised** SQL (never string-concatenated). One statement does everything:

```sql
SELECT q.id, q.text, q."answerNotes", q."clientId", q."updatedAt"
FROM "Question" q
WHERE
  -- 1. visibility (always present, always first; not optional)
  ( q."clientId" IS NULL
    OR EXISTS (SELECT 1 FROM "ClientPermission" cp
               WHERE cp."clientId" = q."clientId" AND cp."userId" = $userId) )
  -- 2. one EXISTS per selected category (AND across categories, IN within)
  AND EXISTS (SELECT 1 FROM "QuestionTag" qt
              WHERE qt."questionId" = q.id AND qt."categoryId" = $cat1 AND qt."tagId" = ANY($cat1Tags))
  AND EXISTS (SELECT 1 FROM "QuestionTag" qt
              WHERE qt."questionId" = q.id AND qt."categoryId" = $cat2 AND qt."tagId" = ANY($cat2Tags))
  -- 3. keyword (optional)
  AND q.search_vector @@ websearch_to_tsquery('english', $keyword)
ORDER BY ts_rank(q.search_vector, websearch_to_tsquery('english', $keyword)) DESC, q.id
LIMIT $limit OFFSET $offset;
```

**Indexes** (in migration SQL):
- `GIN` on `search_vector` — a `GENERATED ALWAYS AS (to_tsvector('english', text || ' ' || "answerNotes")) STORED` column.
- `GIN` (`pg_trgm`) on `normalizedText` — duplicate detection.
- `QuestionTag (categoryId, tagId, questionId)` — per-category EXISTS.
- `ClientPermission (userId, clientId)` PK and `Question (clientId)`.

**Why this design:** the visibility predicate is part of the same `WHERE` as the filters, so restricted rows never leave Postgres; there is no code path that fetches broadly and discards rows. Per-category `EXISTS` (rather than a single `JOIN ... GROUP BY ... HAVING`) keeps AND-across/OR-within semantics simple and avoids row multiplication from multi-tag questions.

### The no-leak guarantee (§3.4)

- Visibility lives in the query. The repository function that runs list/search **requires** a `userId` argument — there is no "unscoped" variant.
- Responses for a non-permitted match and a genuine zero-match are **byte-identical in shape**: `{ "data": [], "page": 1, "limit": 20 }`. No `total`, no facet counts, no timing-dependent extras, no "N hidden results".
- Any count/facet/aggregate queries (if added) reuse the same visibility predicate.
- `GET /questions/:id` on a restricted question the caller can't see returns **404** — identical to a non-existent id — not 403.
- `PATCH /questions/:id` follows the same rule: invisible → 404; visible but not editable → 403.
- Duplicate detection only compares against **visible** questions; otherwise "duplicate of X" would reveal X exists.
- Pagination `OFFSET` is applied after visibility, so page boundaries don't leak.
- Validation errors never echo whether a tag/client exists beyond what the caller can already see.

## 5. API surface

Base path `/api/v1`. JSON in/out. Auth via `Authorization: Bearer <JWT>`.

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Liveness |
| POST | `/auth/register` | none | Create user (role defaults to `USER`) |
| POST | `/auth/login` | none | Returns JWT |
| GET | `/auth/me` | any | Current user + client grants |
| GET | `/tag-categories` | any | Categories with their tags (for filter UI) |
| POST | `/tag-categories`, `/tag-categories/:id/tags` | reviewer | Manage taxonomy |
| GET | `/clients` | any | Clients the caller is permitted for |
| POST | `/clients/:id/permissions` | reviewer | Grant a user access to a client |
| DELETE | `/clients/:id/permissions/:userId` | reviewer | Revoke |
| GET | `/questions` | any | Filter + keyword search (see below) |
| GET | `/questions/:id` | any | One question (404 if not visible) |
| POST | `/questions` | author, reviewer | Create (runs duplicate check) |
| PATCH | `/questions/:id` | author (own), reviewer | Edit |
| POST | `/questions/check-duplicate` | author, reviewer | Dry-run duplicate check |
| GET | `/questions/:id/history` | any (visible) | Change history |

### `GET /questions`

Query params: `q` (keyword), `tags[<categorySlug>]=a,b` (e.g. `tags[technology]=react,node&tags[seniority]=mid,senior`), `clientId`, `page`, `limit` (max 100).

```json
{ "data": [ { "id": "…", "text": "…", "answerNotes": "…", "client": null,
              "tags": { "technology": ["react"], "seniority": ["mid"] },
              "updatedAt": "…" } ],
  "page": 1, "limit": 20 }
```

### `POST /questions`

```json
{ "text": "…", "answerNotes": "…", "clientId": null,
  "tags": { "technology": ["react"], "seniority": ["mid"] },
  "confirmDistinct": false, "distinctReason": "" }
```

- `201` → created question.
- `409 DUPLICATE_SUSPECTED` → `{ "matches": [{ "id", "text", "similarity" }] }` (visible matches only).
- Resubmit with `confirmDistinct: true` + `distinctReason` (required, min length) to override.

### Error format

`{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [...] } }` with codes: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `DUPLICATE_SUSPECTED` 409.

## 6. Duplicate detection

**Rule:** normalise the text (lowercase, strip punctuation, collapse whitespace, drop leading "what is/how do you"-style stop phrases optionally), then compare against **visible** questions using `pg_trgm` `similarity()`. A match is `similarity >= 0.8` (tunable via `DUPLICATE_SIMILARITY_THRESHOLD`) — also an exact `normalizedText` match always counts. The query uses the trigram GIN index (`%` operator with `pg_trgm.similarity_threshold` set, then `similarity()` for ranking), top 5 returned.

**False positive:** the author resubmits with `confirmDistinct: true` and a mandatory `distinctReason`. The question is stored and the override (matched IDs, reason, actor) is written to the audit log. Overriding is allowed for any author/reviewer; the reason is the accountability.

## 7. Authorization & validation

- **Validation (zod)** at the route boundary, before controllers/services: non-empty `text`, known tag-category slugs, tags belonging to their stated category, UUID params, bounded `limit`. Reject unknown fields.
- **Auth middleware** verifies the JWT and loads the user (role + client grant IDs) on every request. No route is anonymous except `/health` and `/auth/login|register`.
- **Role middleware** gates by role; **ownership/edit policy** lives in one function in the service layer (`canEdit(user, question)`) so it is testable and not duplicated.
- Passwords hashed with argon2/bcrypt; JWT secret/expiry from env.

## 8. Change history & audit trail

- `QuestionHistory` row written **in the same DB transaction** as every create/update (`actorId`, `action`, `changes`, `createdAt`).
- Structured logs (pino, JSON) for: question created, question updated, **duplicate submission rejected**, duplicate overridden, edit denied (403). Each carries `userId`, `questionId` (if any), `action`, timestamp, request id.
- Rejected duplicate submissions aren't stored as questions, so they're logged (and optionally persisted in an `AuditLog` table) — the requirement is a structured trace of who and when.

## 9. Project structure

```
src/
  app.ts, server.ts
  config/        env parsing (zod), logger
  routes/        route wiring per resource
  controllers/   thin HTTP handlers
  services/      business rules (auth, questions, duplicates, history, permissions)
  repositories/  Prisma + raw SQL (the only place SQL lives; every method takes the acting user)
  validators/    zod schemas
  middlewares/   authenticate, authorize, validate, errorHandler, requestId
  utils/         AppError, password, jwt
prisma/
  schema.prisma, migrations/ (incl. raw SQL for tsvector + pg_trgm + indexes), seed.ts
tests/
  integration/   supertest against a real Postgres test DB
docker-compose.yml, Dockerfile
```

## 10. Testing (required proofs)

Integration tests run against a real Postgres (not mocks):

1. **No-leak search (most important):** user without permission for Client A searches a keyword that matches *only* Client A's questions → response status, body, and shape are identical to searching a keyword that matches nothing. Repeat with filters and pagination. Also assert a permitted user *does* see the match.
2. **Restricted get-by-id / edit-by-id** by a non-permitted user → 404, same as a random UUID.
3. **Edit permissions:** author edits own → 200; author edits another's by ID → 403; reviewer edits any → 200; user → 403; no token → 401.
4. **Validation:** empty text, nonexistent tag category, tag in wrong category, malformed body → 400 before any service logic runs.
5. **Combined filter:** AND across categories / OR within, plus keyword.
6. **Duplicate detection:** near-duplicate → 409; `confirmDistinct` path → 201 + audit entry; duplicate of a *restricted* question is not reported to a non-permitted user.
7. **History:** create and edit each add a `QuestionHistory` row with the right actor.

## 11. Performance

Seed script generates ~10,000 questions across a dozen categories. Document `EXPLAIN (ANALYZE, BUFFERS)` for the combined filter + keyword + visibility query and the indexes that made it use index/bitmap scans instead of a sequential scan.

## 12. Running it

```bash
cp .env.example .env
docker compose up --build        # API + Postgres; runs migrations + seed
```

`.env` (documented in `.env.example`):

```
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://postgres:postgres@db:5432/question_bank
JWT_SECRET=change-me
JWT_EXPIRES_IN=1d
DUPLICATE_SIMILARITY_THRESHOLD=0.8
```

Local dev without Docker: `npm install && npx prisma migrate dev && npm run dev`.

Scripts: `dev`, `build`, `start`, `test`, `prisma:migrate`, `prisma:seed`.

## 13. Build order

1. Prisma schema + migrations (tsvector, pg_trgm, indexes) + seed (users per role, clients, grants, taxonomy)
2. Env/config, logger, error handling, validation + auth middleware
3. Auth routes → taxonomy/clients routes
4. Question repository (visibility-scoped raw SQL) → list/search/get
5. Create/edit with history in a transaction + edit policy
6. Duplicate detection + override + audit logging
7. Integration tests (start with the no-leak test)
8. Docker Compose, perf seed + query plan write-up

## 14. Stretch (only if time remains — deepen, don't add features)

- Load-test at 10k questions; publish plans and indexes.
- Second client with separate grants; verify a user with access to one but not the other, searching across both.
- "Suggested edit" flow for non-reviewers that reuses `QuestionHistory` rather than a parallel mechanism.
