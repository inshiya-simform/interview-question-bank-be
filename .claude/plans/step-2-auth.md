# Step 2: Auth routes, JWT `authenticate`, `requirePermission`

## Context
Step 1 (Prisma schema, migrations, seed) is merged. The app has no auth code yet: no JWT dependency, no validation layer, and the error handler returns `{success:false,message}` while README §5 specifies `{error:{code,message,details}}`. This step adds `register`/`login`/`me`, a JWT `authenticate` middleware, and `requirePermission(code)` so later routes (taxonomy, clients, questions) can be guarded. JWT uses the **`jsonwebtoken`** package, as requested.

Scope: auth only. pino logger and request-id (also in README Step 2 list) are left out; say so if you want them added here.

## Dependencies
- Add `jsonwebtoken`, `zod`; dev: `@types/jsonwebtoken`. (`bcryptjs` already installed.)
- Repo is ESM + `nodenext`: `import jwt from 'jsonwebtoken'`, relative imports end in `.js`.

## Changes

### Config
- [src/config/env.ts](src/config/env.ts): add `jwtSecret` (required), `jwtExpiresIn` (default `1h`). Reuse existing `required()` helper.
- `.env.example` and local `.env`: add `JWT_SECRET`, `JWT_EXPIRES_IN`.

### Errors
- [src/utils/AppError.ts](src/utils/AppError.ts): add `code` (e.g. `UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `CONFLICT`) and optional `details`.
- [src/middlewares/errorHandler.ts](src/middlewares/errorHandler.ts): respond `{error:{code,message,details}}`; map `ZodError` to 400 `VALIDATION_ERROR`; `notFound` uses `NOT_FOUND`. Keep stack only in development.
- Update `/health` and the OpenAPI `Error` schema only if they conflict with the new shape (health success body stays).

### Utilities
- `src/utils/jwt.ts`: `signToken(userId)` signs `{sub}` with HS256 and `jwtExpiresIn`; `verifyToken(token)` passes `algorithms: ['HS256']` explicitly, throws `AppError(401, UNAUTHENTICATED)` on invalid or expired.
- `src/utils/password.ts`: `hashPassword` / `verifyPassword` wrapping `bcryptjs` (cost 10, matching seed).

### Validation
- `src/middlewares/validate.ts`: `validate(schema)` parsing `req.body` with zod, replacing it with the parsed value.
- `src/validators/auth.validators.ts`: `registerSchema` (email, name, password min 8; `.strict()` rejects unknown fields so a client cannot send `role`), `loginSchema`.

### Auth middleware
- `src/types/express.d.ts`: augment `Request` with `user?: AuthUser` (`id, email, name, role, permissions: string[], clientIds: string[]`).
- `src/middlewares/authenticate.ts`: read `Authorization: Bearer <token>`, `verifyToken`, then one Prisma query for the user with `role.permissions.permission.code` and `permissions` (client grants). 401 if the header is missing, the token is bad, or the user no longer exists. Sets `req.user`.
- `src/middlewares/requirePermission.ts`: `requirePermission(code)` returns 401 if no `req.user`, 403 `FORBIDDEN` if `code` is not in `req.user.permissions`. (Own-vs-any edit checks stay in the service layer later, per README §7.)

### Auth routes
- `src/services/auth.service.ts`: `register` (look up role `USER` by name, hash password, create; unique-email violation `P2002` becomes 409), `login` (find by email, compare hash; same 401 message for unknown email and wrong password, run a dummy compare when the user is missing to avoid a timing leak), `getMe`.
- `src/controllers/auth.controller.ts`, `src/routes/auth.routes.ts`, mounted in [src/routes/index.ts](src/routes/index.ts) at `/auth`:
  - `POST /auth/register`: public, 201 `{user, token}`; never returns `passwordHash`.
  - `POST /auth/login`: public, 200 `{token, user}`.
  - `GET /auth/me`: `authenticate`; returns user, role, permissions and client grants.
- Per README §7 no anonymous access except `/health` and `/auth/*`; later routers apply `authenticate` at router level.

### OpenAPI
- [src/docs/openapi.ts](src/docs/openapi.ts): add the three `/auth/*` paths, request/response schemas, `bearerAuth` on `/auth/me`, reuse the existing `Unauthorized`/`Forbidden` responses.

## Verification
1. `npm run db:up`, `npm run prisma:seed`, `npm run dev`; `npx tsc --noEmit` passes.
2. curl checks against `/api/v1`:
   - Login as `author@example.com` / `password123`: 200 with a token. Wrong password and unknown email: identical 401.
   - `GET /auth/me` with token: shows AUTHOR permissions (`question:read/create/edit_own`); no token or garbage token: 401; `acme-user@example.com` shows the Acme client grant.
   - `POST /auth/register` with a new email: 201, role `USER`; same email again: 409; body containing `role` or a short password: 400 `VALIDATION_ERROR`.
   - Temporarily mount a throwaway route with `requirePermission('question:edit_any')`: reviewer gets 200, author gets 403 (remove it afterwards).
3. Swagger UI at `/api/docs` shows the new endpoints and "Authorize" works.
4. No test framework exists yet (integration tests are README Step 7), so verification is manual for now.
