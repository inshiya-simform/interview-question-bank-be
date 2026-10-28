# In-app notifications via SSE

## Context
The backend only notifies users by email (`sendEmailSafe` calls after client access grant/revoke, question review, password changes). Users have no in-app signal. We add persisted notifications and push them live over Server-Sent Events. The UI follows the "Notifications Design" canvas: a sidebar bell with an unread badge (9+), a dropdown with the latest 5 items and "Mark all as read", a "Read more (N total)" link to a full page with All/Unread tabs and pagination, plus loading/empty/error states.

Findings that shape the design:
- Single Render instance, no Redis/queue/event emitter, so an in-memory connection hub works. Multi-instance would need Postgres LISTEN/NOTIFY or Redis later.
- Auth is `Authorization: Bearer` only (`src/middlewares/authenticate.ts`). Native `EventSource` can't send headers.
- No compression middleware, so nothing to exclude for SSE. Errors thrown after headers are sent would hit `errorHandler`, so the stream handler needs its own guard.
- Hooks already exist next to the email sends. Emit after the transaction commits, never failing the request.
- No test framework, so verification is manual (curl plus Prisma Studio).

## Decisions
- **SSE auth:** the frontend uses `@microsoft/fetch-event-source` (fetch with the Bearer header), so `authenticate` is reused unchanged with no token in URLs/logs. Fallback if native `EventSource` is required: a short-lived one-time ticket (`POST /notifications/stream-ticket`, 30 s TTL, in-memory).
- **Persist first, push second.** The DB is the source of truth. SSE is only a hint to update the UI. On (re)connect the client refetches unread count and the first page, so no `Last-Event-ID` replay is needed.
- **Store `type` + `data` (ids), not URLs.** The frontend builds titles, copy and deep links from the type, which keeps copy changes out of the DB.

## Notification events

| Type | Trigger (file:line) | Recipient |
|---|---|---|
| `CLIENT_ACCESS_GRANTED` | `admin.service.ts` `grantClientAccess`, next to the email at ~154 (only when `granted`) | target user |
| `CLIENT_ACCESS_REVOKED` | `revokeClientAccess` ~176 (only when `revoked`) | target user |
| `QUESTION_APPROVED` / `QUESTION_CHANGES_REQUESTED` / `QUESTION_REJECTED` | `question.service.ts` `notifyAuthor` (747-764), also covers `bulkReview` | question author (existing skip when author = reviewer) |
| `QUESTION_SUBMITTED` | `createQuestion` (128), `updateQuestion` re-entering PENDING_REVIEW (484/491) | users with `question:review` (restrict by client access when `question.clientId` is set) |
| `CLIENT_QUESTION_ADDED` | on approve of a question with a non-null `clientId` | users with a `ClientPermission` for that client, excluding the author. Skip `clientId = null` questions to avoid spamming everyone. |
| `IMPORT_FINISHED` | `questionImport.service.ts` ~225 | importing user |
| `PASSWORD_CHANGED` (optional) | `auth.service.ts` ~439/456 | that user (security notice) |

Not notified: staff welcome (user hasn't logged in), review-lock events (noisy). Extra types can be added later without a migration, since `type` can be an enum extended via a migration or a string constant.

## Backend implementation

1. **Schema** (`prisma/schema.prisma` + new migration): `NotificationType` enum and a `Notification` model with `id` (uuid), `userId` (FK, cascade), `type`, `data Json`, `readAt DateTime?`, `createdAt`. Indexes: `[userId, createdAt(sort: Desc)]` and `[userId, readAt]`. Add the back-relation on `User`. Run `prisma:migrate` and `prisma:generate`.
2. **`src/services/notification/notification.hub.ts`**: `Map<userId, Set<Response>>` with `subscribe(userId, res)` (returns an unsubscribe function, caps connections per user at ~5) and `publish(userId, event, payload)`, which writes `event: notification\ndata: {...}\n\n`. A single `setInterval(...).unref()` writes a `: ping` comment every 25 s to survive Render's idle timeout. Same pattern as `startOrphanImageSweep`.
3. **`src/services/notification.service.ts`**:
   - `notify(userIds, {type, data})` dedupes ids, uses `createManyAndReturn` to persist, then `hub.publish` for each. It is wrapped like `sendEmailSafe`, so it logs and swallows errors, and is called only after commits.
   - `list(user, {page, limit, status})` returns `{items, page, limit, total, unreadCount}` using the repo's `$transaction([count, findMany])` pagination shape.
   - `unreadCount`, `markRead(user, id)` (scoped to `userId`, idempotent, 404 if missing), `markAllRead(user)`.
   - `purgeOld()` deletes read notifications older than 90 days, scheduled with `setInterval(...).unref()` from `server.ts`.
4. **Validators / controller / routes** (mirror `collection.*`): `src/validators/notification.validators.ts` (`.strict()`, page/limit `z.coerce` default 20 max 100, `status: all|unread`), `controllers/notification.controller.ts`, `routes/notification.routes.ts` with `router.use(authenticate)` and no permission requirement, since every role gets notifications. Register in `routes/index.ts` and `docs/openapi.ts`.
   - `GET /notifications?status=&page=&limit=`
   - `GET /notifications/unread-count`
   - `PATCH /notifications/:id/read`
   - `POST /notifications/read-all`
   - `GET /notifications/stream` (SSE)
5. **SSE handler:**
   - Headers `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`, then `res.flushHeaders()` and an initial `retry: 5000` plus `event: ready`.
   - Own try/catch (no `next(err)` after headers). Unsubscribe on `req.on('close')`.
   - End the stream at JWT expiry (`exp`) so the client re-authenticates. Call `hub.closeUser(userId)` from `changePassword`/`resetPassword` to drop stale sessions.
   - CORS `*` is fine with header auth. If compression is ever added, skip this route.
6. **Hook the events** from the table above, next to the existing `sendEmailSafe` calls. Add a small `notifyMany` helper for the reviewer / client-members fan-out queries.

## Where the user sees notifications (frontend, separate repo)
- **Sidebar bell** (per design): label "Notifications" with a dark pill badge showing unread count (`9+` cap). The button opens the dropdown (`aria-expanded`, `aria-haspopup`, label "Notifications, N unread").
- **Dropdown:** latest 5, unread rows tinted with a dot and bold title, "Mark all as read", footer "Read more → (N total)" linking to the full page. Clicking an item marks it read and deep-links by type.
- **Full page** `/notifications`: All/Unread tabs with counts, "Showing x of y", "New" pill on unread, Previous/Next pagination, and the loading/empty/error states from the canvas.
- **Live updates:** a `NotificationProvider` opens the stream after login, closes on logout, and reconnects with backoff. On `ready` it refetches the count and first page. On `notification` it prepends the item and bumps the badge, with an optional toast. Show a toast only for the key types (access granted/revoked, review outcomes).
- **Deep links by type:** approve/changes/reject goes to "My submissions" or the question; submitted goes to the Review queue (shown to reviewers); client access granted/revoked goes to Questions filtered by that client; import finished goes to the import summary.
- The design's glyphs map to types: ✓ approved, ! changes requested, ✕ rejected, + client question, ★ permission granted, ↓ import. Revoked needs its own glyph. The design has no icon for it.

## Rollout order
1. Schema, migration and service, then the REST endpoints (list, count, read, read-all).
2. SSE hub and stream endpoint.
3. Wire events: client access and question review first, then submitted, client question and import.
4. Frontend provider, bell, dropdown and page.
5. README/openapi updates, retention job.

## Verification
- `npm run build` and `npm run dev`.
- Stream: `curl -N -H "Authorization: Bearer $T" localhost:<port>/api/v1/notifications/stream` shows `ready` and `: ping` every ~25 s.
- As SUPER_ADMIN grant then revoke client access for that user, and the curl stream receives both events. Check the rows in Prisma Studio and the `GET /notifications` response (unreadCount, pagination, `status=unread`).
- As REVIEWER approve, request changes and reject a question, and the author gets the matching events. Bulk review gives one per question.
- Create or edit a question, and reviewers receive `QUESTION_SUBMITTED`. A user without access to that client doesn't.
- `PATCH /:id/read` with another user's id returns 404. `read-all` zeroes the count.
- Reconnect: kill and restart the stream, and the client refetches state. Change password closes the open stream.
- A failure inside `notify` (e.g. simulated DB error) must not fail the original request.
