# Plan: Export filtered/searched questions to CSV

## Context
`GET /questions` supports `clientId`, `tags`, `categories`, `search` and pagination (max 100/page). Users need to download everything matching their current filters/search as a CSV, ignoring pagination, so the export returns all matching rows, not just one page.

## Approach
Add `GET /questions/export`, reusing the list endpoint's exact filter logic so the CSV equals what the UI shows (including `liveFilter(user)` visibility rules).

### 1. Validator – `src/validators/question.validators.ts`
- Add `exportQuestionsQuerySchema` = list query schema minus `page`/`limit` (keep `.strict()`).

### 2. Service – `src/services/question.service.ts`
- Extract the where-building part of `listQuestions` (~lines 173-205: `liveFilter`, clientId, tags, categories, full-text `search`) into `buildListWhere(user, query)`; `listQuestions` calls it (behavior unchanged).
- Add `exportQuestions(user, query)`: uses `buildListWhere`, same order (`createdAt desc, id asc`), fetches in batches of 500 with `questionInclude`, mapped via `toQuestionDto`. Implemented as an async generator so rows are streamed, not held in memory.
- Safety cap (10,000 rows, adjustable) → `AppError(400, 'VALIDATION_ERROR', 'Too many results, narrow your filters')`, checked before streaming starts.

### 3. CSV formatting – new `src/services/questionExport.service.ts`
- Columns match the import format so exports can be re-imported: `text, answer_notes, client, tags` (`tags` = `category:tag|tag;category:tag`, inverse of `resolveTags` in `questionImport.service.ts`).
- Own `csvEscape` helper (only `csv-parse` is installed; no new dependency).
- CSV-injection guard: prefix cells starting with `= + - @` with `'`.
- UTF-8 BOM so Excel renders non-ASCII correctly.

### 4. Controller + route
- `src/controllers/question.controller.ts`: `exportQuestions` handler — parse query, set `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="questions-<YYYY-MM-DD>.csv"`, write header + rows, `res.end()`. Errors before the first write go to `next(err)`.
- `src/routes/question.routes.ts`: `router.get('/export', requirePermission('question:read'), exportQuestions);` declared **before** `router.get('/:id', …)`, otherwise `/:id` swallows it.
- Optionally document in `src/docs/openapi.ts`.

### 5. Frontend note (separate repo)
Call `/questions/export` with the same query params as the current list (minus page/limit) via authenticated fetch and download the blob (a plain link won't carry the Bearer token).

## Verification
- `npx tsc --noEmit` and lint.
- With a seeded token, `curl` the export with no filter, `tags`, `categories`, `search`; row count must equal `total` from `GET /questions?limit=1` for the same filters, including totals > 100.
- Reviewer/client-scoped users only get rows visible in the list.
- Re-import the exported CSV via `POST /questions/import` to confirm round-trip format.
- Fields with commas, quotes, newlines and a leading `=` are escaped; invalid query param → 400; over cap → 400.
