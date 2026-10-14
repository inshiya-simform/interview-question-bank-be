# Step 3 — POST /api/v1/questions (permission-gated)

## Context
Steps 1 (DB) and 2 (auth) are done. `requirePermission` existed but nothing used it yet. Step 3 adds the first question endpoint: create a question, allowed only to users holding `question:create` (seeded: AUTHOR only; REVIEWER/USER get 403). Duplicate detection is deferred to a later step.

## Decisions
- Duplicate detection deferred. Body schema still accepts optional `confirmDistinct` / `distinctReason` so the contract is stable; they are ignored for now.
- If `clientId` is set, caller must hold a grant (`req.user.clientIds`); otherwise 404 NOT_FOUND (same as a nonexistent client, no leak).
- No new migration or permission needed (`question:create` already seeded).
- Question and its `QuestionHistory` (CREATED) row are written in one transaction (README §8).

## Changes
1. `src/validators/question.validators.ts` (new) — `createQuestionSchema` (zod, `.strict()`): `text` (trim, min 1), `answerNotes`, `clientId` (uuid, nullable, optional), `tags` (array of `{ categoryId, tagIds }`, ids are positive integers, at least one entry, each `categoryId` at most once), `confirmDistinct?`, `distinctReason?`. Exports `CreateQuestionInput`.
2. `src/services/question.service.ts` (new) — `createQuestion(user, input)`:
   - Ungranted `clientId` → `AppError(404, 'NOT_FOUND')`.
   - Look up `Tag` rows by `(id, categoryId)`; any unknown tag id, or tag not in its stated category → `AppError(400, 'VALIDATION_ERROR')` with details.
   - `prisma.$transaction`: create `Question` (`normalizedText` via `normalizeText`, `authorId = user.id`, nested `tags.create` with `tagId` + `categoryId`), then create the `QuestionHistory` row. Never writes `searchVector`.
   - Returns `{ id, text, answerNotes, client, tags: { categorySlug: [tagSlugs] }, authorId, createdAt, updatedAt }`.
3. `src/controllers/question.controller.ts` (new) — thin handler, try/catch → `next(err)`, 201.
4. `src/routes/question.routes.ts` (new) — `router.use(authenticate)`; `POST /` with `requirePermission('question:create')`, `validate(createQuestionSchema)`. Mounted in `src/routes/index.ts` at `/questions`.
5. `src/docs/openapi.ts` — `Questions` tag, `POST /questions` path, `CreateQuestionRequest` / `Question` schemas.

Reused: `authenticate`, `requirePermission`, `validate`, `AppError`, `normalizeText`, `prisma` singleton, `AuthUser` type.

## Verification
- `npx tsc --noEmit` — clean.
- Input takes ids, response stays slug-based. Request example: `"tags": [{ "categoryId": 1, "tagIds": [1, 2] }]`.
- Manual curl with seed users (password `password123`):
  - no token → 401; reviewer → 403; author valid body → 201.
  - tag id in the wrong category → 400; unknown tag id → 400; repeated categoryId → 400; old slug-map shape → 400; extra field → 400.
  - author with a `clientId` they have no grant on → 404.
- `QuestionHistory` CREATED row confirmed with the author as actor.
- Not yet verified: granted-client success path.
- Integration tests are build-order step 7 (no test framework yet).

## Follow-ups
- Duplicate detection (409 `DUPLICATE_SUSPECTED`, `confirmDistinct`, audit logging) — README build-order step 6.
- Integration tests for the endpoint.
