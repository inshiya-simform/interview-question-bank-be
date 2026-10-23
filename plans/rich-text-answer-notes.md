# Rich text for `answerNotes` (links, images, formatting) — images in MinIO

## Context
`Question.answerNotes` is a plain `TEXT` field (zod `max(10000)`, `src/validators/question.validators.ts:15`). The frontend will move to a rich-text editor, so the backend receives **HTML** and must (a) store it safely, (b) handle images, (c) keep search/export/history/audit sane.

Findings: no HTML sanitizer, no upload storage, `express.json()` default 100 kb limit, only upload code is CSV via multer memoryStorage (`src/middlewares/uploadCsv.ts`). `docker-compose.yml` runs only Postgres (service `db`, volume `pgdata`); `render.yaml` deploys a web service + managed Postgres on the free plan. Config lives in `src/config/env.ts` (`required()` helper) and `.env.example`.

## Image strategy: MinIO (S3-compatible)
**Never accept base64 images inline in the HTML.** Editors embed pasted images as `data:` URIs by default, which bloats the DB, breaks the body/length limits, and pollutes diffs and search. Instead:

1. Frontend uploads first: `POST /api/v1/uploads/images` (multipart, field `file`) → `{ url }`.
2. Backend validates and stores the object in MinIO, key `question-images/<uuid>.<ext>`.
3. Frontend inserts `<img src="{url}">`; `answerNotes` only ever carries URLs.
4. The sanitizer drops any `data:` src and any `<img>` not pointing at our image URL pattern.

**Client:** MinIO speaks the S3 API → use `@aws-sdk/client-s3` (`forcePathStyle: true`, custom `endpoint`). No MinIO-specific SDK needed, so moving to AWS S3/R2 later is a config change only.

**Stable URLs, private bucket:** do not store presigned URLs in the HTML (they expire). Keep the bucket private and serve through the API: `GET /api/v1/uploads/images/:id` streams the object from MinIO with `Content-Type`, `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=31536000, immutable`. The `<img>` URL in the stored HTML is this API path (relative or `API_PUBLIC_URL`-prefixed), unaffected by MinIO host changes. Image read is unauthenticated (UUID is unguessable) so plain `<img>` tags work; can be tightened to cookie/signed-URL later.

**Validation on upload:** 2 MB cap, allow `png/jpeg/webp/gif` only, verify magic bytes (not the client mimetype), no SVG, rate-limit (reuse `src/middlewares/rateLimit.ts` pattern), require `authenticate` + (`question:create` or `question:edit_own`) — already seeded in `prisma/seed.ts:24-25`.

**Metadata table** `QuestionImage { id uuid, objectKey, mimeType, size, createdById, questionId? , createdAt }` (new migration). Needed to resolve `:id` → key, to track ownership, and for orphan cleanup: on question create/update/draft save, parse image ids from the sanitized HTML and set `questionId`; a cleanup job (on startup + interval) deletes objects/rows with `questionId IS NULL` older than 24 h.

**Abstraction:** `src/services/imageStorage.service.ts` exposing `save`, `getStream`, `delete`; only this file knows about S3/MinIO.

**Infra:**
- Local: add a `minio` service to `docker-compose.yml` (image `minio/minio`, ports 9000/9001, volume `miniodata`, `server /data --console-address ":9001"`), plus a bucket bootstrap (`minio/mc` one-shot service or create-bucket-if-missing in app startup via `HeadBucket`/`CreateBucket`). Hook into the existing `predev` flow.
- Env (`env.ts` + `.env.example`): `S3_ENDPOINT`, `S3_REGION` (e.g. `us-east-1`), `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE=true`, `API_PUBLIC_URL`.
- **Production caveat:** Render's free plan has no persistent disk, so MinIO can't be hosted there for free. Options: run MinIO on a VM/container with a volume (Render private service + disk is paid, or any VPS), or point the same S3 env vars at Cloudflare R2/AWS S3. The code is identical either way; flagging so deploy isn't a surprise. `render.yaml` gets the new env vars (`sync: false` for secrets).

## HTML safety (XSS)
Add `sanitize-html` (+ `@types/sanitize-html`). New `src/utils/sanitizeHtml.ts`:
- Allow tags: `p br strong em u s h1-h4 ul ol li blockquote code pre a img hr table thead tbody tr th td`.
- `a`: `href` only with `http|https|mailto`; force `rel="noopener noreferrer nofollow"`, `target="_blank"`.
- `img`: only `src` (our image URL pattern), `alt`, `width`, `height`.
- Strip scripts, event handlers, `style`, `javascript:` / `data:` URLs.
Apply as a zod `.transform` on `answerNotes` in `createQuestionSchema` and `updateQuestionSchema` so create, update/draft and CSV import (which reuses `createQuestionSchema.shape.answerNotes`) all sanitize. Sanitize on write so stored values are canonical for diffs. Frontend should still render defensively.

## Validation / compatibility
- Limits: HTML max ~50,000 chars **and** plain-text length (tags stripped) ≤ 10,000 to preserve the original intent. Update `src/docs/openapi.ts` (~lines 1116–1220).
- `express.json({ limit: '256kb' })` at `src/app.ts:13`. Image route uses its own multer instance (2 MB, memoryStorage) modeled on `uploadCsv.ts`.
- Legacy plain-text notes: frontend treats non-HTML as text; optional one-off data migration wrapping them in `<p>` with escaping (reuse `escapeHtml`, `src/services/email/templates/layout.ts:25`).

## Knock-on effects
- **Search:** `searchVector` is generated from `answerNotes` (init migration), so tags/URLs would be indexed. New hand-written migration drops/recreates the generated column + GIN index using `regexp_replace(answerNotes, '<[^>]+>', ' ', 'g')`.
- **Export:** `questionExport.service.ts` exports raw HTML in `answer_notes` (round-trips with import). Image URLs only resolve inside the app — documented limitation.
- **Import:** flows through the same schema → sanitized automatically; plain-text rows remain valid.
- **History/audit/drafts:** store sanitized HTML as-is; no code change beyond image linking in `question.service.ts` (create ~133, draft diff ~375–396, approval apply ~703).
- **Emails:** don't include `answerNotes`; unchanged.

## Files to touch
- `prisma/schema.prisma` + 2 migrations (QuestionImage; searchVector)
- `docker-compose.yml`, `render.yaml`, `.env.example`, `src/config/env.ts`
- `package.json`: `@aws-sdk/client-s3`, `sanitize-html`, `@types/sanitize-html`
- New: `src/utils/sanitizeHtml.ts`, `src/services/imageStorage.service.ts`, `src/middlewares/uploadImage.ts`, `src/controllers/upload.controller.ts`, `src/routes/upload.routes.ts` (register with other routes)
- Modify: `src/validators/question.validators.ts`, `src/services/question.service.ts`, `src/app.ts`, `src/docs/openapi.ts`

## Verification
1. `docker compose up` (Postgres + MinIO), `npx prisma migrate dev`, `npm run build`, `npm run dev`; bucket auto-created.
2. Upload png/jpg OK and visible in MinIO console (:9001); reject svg, renamed exe (magic bytes), >2 MB, unauthenticated.
3. Open returned URL in browser: correct content-type, cache headers, works without auth.
4. Create question with `<script>`, `onerror=`, `javascript:` link, `data:` img → stripped; valid `<a>`/`<img>` kept with safe attrs.
5. Edit a published question (draft path), approve; HTML and images persist and `questionId` is linked.
6. Search finds words inside notes; "href"/"strong" don't match.
7. CSV export → re-import round trip; legacy plain text still works.
8. Orphan cleanup removes only unreferenced images older than 24 h (object and row).
(No test runner exists; add unit tests for `sanitizeHtml` if one is introduced.)
