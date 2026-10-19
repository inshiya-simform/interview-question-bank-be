# Question approval (review) flow

## Context
Today any question a USER creates is instantly visible to everyone with access, and a REVIEWER is just a role with `question:edit_any`. We want a review cycle:
- A new question is hidden from other users until any reviewer approves it.
- Editing an approved question triggers re-review. Until a reviewer approves the edit, other users keep seeing the last approved version.
- A reviewer can request changes with a note. The author edits, and the question auto-resubmits to review.

Decisions: (1) keep the last approved version live during re-review; (2) the author's edit after a change request auto-resubmits.

## Status model
`enum QuestionStatus { PENDING_REVIEW, APPROVED, CHANGES_REQUESTED, REJECTED }`

New `Question` columns: `status` (default `PENDING_REVIEW`), `publishedAt DateTime?` (set on first approval; marks "has a live version"), `reviewedById String?`, `reviewedAt DateTime?`, `reviewNote String?`. Index on `status` and on `publishedAt`.

New model `QuestionDraft` (one per question, `questionId @unique`, `payload Json` = `{text, answerNotes, clientId, tags:[{tagId,categoryId}]}`, `authorId`, `createdAt`/`updatedAt`). It holds a pending edit of an already-published question. The `Question` row itself always carries the live approved content once `publishedAt` is set.

Transitions:
- Create (USER): `PENDING_REVIEW`, `publishedAt = null`.
- Author edits, never published: update the question in place, status becomes `PENDING_REVIEW`, `reviewNote` cleared.
- Author edits, published: upsert `QuestionDraft`, status becomes `PENDING_REVIEW`. Live columns are untouched. A later edit while pending replaces the draft.
- Approve (reviewer): if a draft exists, apply it to the question (text, notes, client, tag replace) and delete the draft. Set `APPROVED`, `publishedAt ??= now`, `reviewedById/At`, clear `reviewNote`.
- Request changes (reviewer): note is required. Set `CHANGES_REQUESTED`, `reviewNote`, `reviewedById/At`. The draft, if any, is kept so the author edits it.
- Reject (reviewer, assumption): note (reason) is required, only from `PENDING_REVIEW`.
  - Never-published question: status becomes `REJECTED`, which is final. It stays hidden from others, the author sees it read-only with the reason, and edits return 409.
  - Published question with a pending draft: the draft is discarded and the live version stays. Status returns to `APPROVED` with `reviewNote` holding the rejection reason, so the author can see why. The author can then submit a new edit.
- Reviewers do not edit questions directly (see Reviewer permissions below). All content changes come from the author and go through review.

## Visibility (the key change)
Rewrite `visibilityFilter` in `src/services/question.service.ts`:
- Holders of `question:review`: see all questions, any status.
- Everyone else: the existing client/null rules AND `publishedAt != null`, OR `authorId = user.id` (author always sees own questions, any status).
- The same filter must feed the raw-SQL full-text search and `findDuplicates` (pg_trgm), so unapproved content never leaks through search or duplicate-check responses (the README's "no leak" rule).
- Author and reviewer detail views include `draft` and `reviewNote`. Other users never see drafts.
- Visibility moves off `question:edit_any` onto the new `question:review` permission.

## Permissions and migration
- **Reviewer permissions:** remove `question:edit_any` from `REVIEWER`, leaving `question:read` and `question:review`. Reason: a direct reviewer edit would bypass the review cycle, and reviewers now act through approve, reject and request-changes. Nobody else holds `edit_any`, so the permission code is retired. Remove its role-permission rows in the migration and delete the code from the seed and the schema.prisma comment.
- Places that use `edit_any` today and must switch: `visibilityFilter` (`question.service.ts:161`) and `listPermittedClients` (`client.service.ts:7`) both move to `question:review`. The `canEditAny` client-assignment bypass in `updateQuestion` (`question.service.ts:224`) is dropped, since only authors edit. The route guard (`question.routes.ts:19`) becomes `question:edit_own`, and the OpenAPI summary (`openapi.ts:498`) is updated.
- New permission `question:review`, granted to `REVIEWER`. Add it with an idempotent SQL migration, following `20261014130000_client_create_permission`, and add it to `rolePermissions` in `prisma/seed.ts`. The seed uses `update: {}`, so the migration is required for existing DBs.
- New migration: create the enum, add the columns and `QuestionDraft`, add `APPROVED`, `CHANGES_REQUESTED` and `REJECTED` to `HistoryAction`, and backfill `status = APPROVED, publishedAt = createdAt` for all existing questions.
- Run `prisma generate` (`src/generated/prisma` is committed).

## API
In `question.routes.ts`, the controller, the service and `question.validators.ts`:
- `POST /questions/:id/approve` guarded by `question:review`.
- `POST /questions/:id/request-changes` guarded by `question:review`. Body `{ note: string (min 1) }`.
- `POST /questions/:id/reject` guarded by `question:review`. Body `{ note: string (min 1) }`.
- `GET /questions` gains a `status` filter. Reviewers get a queue with `status=PENDING_REVIEW`. Authors see their own questions with their status.
- `PATCH /questions/:id` implements the author rules above.
- Errors: 409 `CONFLICT` for approving, rejecting or requesting changes on a question that is not `PENDING_REVIEW`. 404 for questions the caller cannot see.
- Every transition writes a `QuestionHistory` row inside the same `$transaction`, with the note in `changes`.
- Response DTO: extract the mapper that is duplicated four times in the service, then add `status`, `reviewNote`, `reviewedBy`, `reviewedAt` and, for author and reviewer only, `draft`.

## Housekeeping
- `src/docs/openapi.ts`: new endpoints, `status` in shared schemas, the `status` query param.
- `README.md`: the permissions table, the data model, the API table and a short description of the review workflow.
- Seed: mark existing sample questions `APPROVED` with `publishedAt` set, and add one `PENDING_REVIEW` and one `CHANGES_REQUESTED` sample.

## Verification (no test suite exists)
Run `prisma migrate dev` and `prisma db seed`, start the app, and with the seed users (password `password123`) check:
1. `user@example.com` creates a question. It is `PENDING_REVIEW`, visible to the author and the reviewer, and absent from `acme-user@example.com`'s list, search and duplicate check.
2. `reviewer@example.com` approves it. It now appears for the other user.
3. The author edits it. The other user still sees the old text, and the reviewer sees the draft.
4. The reviewer requests changes with a note. The author sees `CHANGES_REQUESTED` and the note. The author edits and the status returns to `PENDING_REVIEW`.
5. The reviewer approves. The draft is applied and the other user sees the new text.
6. Reject a new question with a reason: status `REJECTED`, still hidden from others, author sees the reason, author edit returns 409. Reject a re-review draft: the live text is unchanged and status returns to `APPROVED` with the reason.
7. Request changes or reject without a note returns 400. Approve by a USER returns 403. Approve on an already-approved question returns 409.
8. Check `QuestionHistory` rows for each step, and that existing questions were backfilled to `APPROVED`.
