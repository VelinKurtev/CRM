# API Readiness Checklist

Review this once **Phase 1 – Authentication & User Roles (US-004 – US-010)** is complete. These are cross-cutting API items that Phase 1 depends on or should leave behind. Tick each box when verified, and note the file or PR that implements it.

Legend: 🔴 should exist for Phase 1 to be considered done · 🟡 recommended · 🟢 can wait until later phases

---

## 1. API documentation

- [x] 🔴 Swagger UI served at `/api/docs`, raw spec at `/api/openapi.json` *(done in US-002 follow-up)*
- [x] 🔴 Every Phase 1 endpoint is in the spec (login, register, forgot/reset password, refresh/logout, profile, change password, roles & permissions) *(all 7 `/auth/*`, `/users/me`, `/users/me/password`, `/users`, `/users/{id}/role`, `/roles` in `src/openapi.ts`)*
- [x] 🔴 `bearerAuth` security scheme defined, so "Authorize" works in Swagger UI *(`components.securitySchemes` in `src/openapi.ts`)*
- [ ] 🟡 Request and response schemas generated from the Zod schemas (e.g. `zod-to-openapi`) rather than hand-written
- [ ] 🟡 Example requests and error responses documented for each endpoint
- [ ] 🟢 Typed client generated from the spec for `crm-app` (`openapi-typescript`)

## 2. Validation & errors

- [x] 🔴 `validate(schema)` middleware for body, query and params; returns 400 with per-field errors
- [x] 🔴 Central error-handling middleware with one consistent JSON error shape
- [x] 🔴 `HttpError` helper (400/401/403/404/409) used instead of ad-hoc `res.status()` calls
- [x] 🔴 Unknown routes return a JSON 404
- [x] 🟡 No stack traces or internal messages leak in production responses *(`src/middleware/error-handler.ts` returns a generic 500; details go to the log only; covered in `security.test.ts`)*

## 3. Authentication & authorization

- [x] 🔴 Passwords hashed with bcrypt or argon2 — never stored or logged in plain text
- [x] 🔴 JWT signed with a secret from env; access-token expiry configured
- [x] 🔴 Refresh-token or session strategy implemented per US-007
- [x] 🔴 `authenticate` middleware protects all non-public routes
- [x] 🔴 RBAC middleware (`requireRole` / `requirePermission`) enforces Admin, Sales, Manager, Support access
- [x] 🔴 Registration rejects duplicate emails (409) and validates input with Zod
- [x] 🔴 Password reset tokens are single-use and expire
- [x] 🟡 Inactive users (`isActive = false`) cannot log in
- [x] 🟡 Login does not reveal whether the email or the password was wrong

## 4. Database

- [x] 🔴 Seed script creates default roles, permissions, an admin user and a default pipeline with stages *(pipeline added to `prisma/seed.ts` after this review; it was missing)*
- [x] 🔴 Seed is idempotent (safe to run twice)
- [x] 🔴 Any schema changes from Phase 1 (e.g. reset tokens, refresh tokens) have committed migrations *(migrations `password_reset` and `refresh_tokens`; `prisma migrate status` is up to date)*
- [x] 🟡 `npm run db:seed` script exists and is documented in the README *(script in `crm-api/package.json`, documented in root `README.md`)*
- [x] 🟡 Indexes exist on columns used for login and lookup (`User.email` is unique) *(`User.email` is `@unique`)*

## 5. Security hardening

- [x] 🔴 `helmet` security headers enabled *(`src/app.ts`; CSP relaxed only for `/api/docs`)*
- [x] 🔴 Rate limiting on login, register and forgot-password *(`src/lib/rate-limit.ts`, applied to register, login, forgot and reset in `routes/auth.ts`; 20 requests / 15 min / IP; off under test)*
- [x] 🔴 CORS restricted to the configured frontend origin (not `*`) *(`CORS_ORIGIN` in `src/config.ts`, `*` is rejected at startup)*
- [x] 🔴 No secrets committed; `.env.example` lists every required variable *(`.env` is git-ignored; `.env.example` lists every variable)*
- [x] 🟡 Request body size limit set *(`express.json({ limit: '100kb' })`, oversize returns 413)*
- [x] 🟡 Auth events (login, failed login, password change) written to `AuditLog` *(`src/lib/audit.ts`: LOGIN, LOGIN_FAILED, PASSWORD_CHANGE, PASSWORD_RESET (plus existing ROLE_CHANGE))*
- [x] 🟢 `npm audit` reviewed *(0 vulnerabilities in both apps; `crm-app` had 5 high, fixed with `npm audit fix`)*

## 6. Logging & observability

- [x] 🟡 Structured request logging (`pino` / `pino-http`) with a request ID *(`pino-http` in `src/app.ts`, `X-Request-Id` on every response)*
- [x] 🟡 Sensitive fields (passwords, tokens, auth headers) redacted from logs *(redaction paths in `src/lib/logger.ts`)*
- [x] 🟡 `/api/health` still reports DB status after the auth changes *(`routes/health.ts` + `health.test.ts`)*
- [ ] 🟢 Error tracking (e.g. Sentry) wired in

## 7. Testing & code quality

- [x] 🔴 Integration tests for every Phase 1 endpoint (success, validation error, unauthorized, forbidden) *(`auth`, `register`, `session`, `password-reset`, `users`, `roles` test files)*
- [x] 🔴 Tests use a separate test database, not the dev database *(`crm_test`, created and migrated by `src/test/global-setup.ts`; guarded so it can't run against a non-`_test` database)*
- [x] 🟡 Linter configured for `crm-api` (ESLint or oxlint) *(oxlint, `npm run lint`)*
- [x] 🟡 `npm run typecheck`, `lint`, `test` and `build` all pass for both `crm-api` and `crm-app` *(verified for both apps)*
- [ ] 🟢 Test coverage report

## 8. Frontend ↔ API integration

- [x] 🔴 `crm-app` axios client has a base URL from env, attaches the token and handles 401 (redirect to login / refresh)
- [x] 🔴 Protected routes in the React app redirect unauthenticated users
- [x] 🟡 Role-based UI: menu items and actions hidden when the role lacks permission *(sidebar filtered by permission, `<Can>`, quick actions)*
- [x] 🟡 API errors surface as toasts or form errors using the shared error shape *(`getErrorMessage` / `getFieldErrors` in forms; toasts on the users page)*

## 9. DevOps & documentation

- [x] 🟡 Root `README` explains setup: `npm install`, `db:up`, `db:deploy`, `db:seed`, `dev` for both apps *(root `README.md`)*
- [x] 🟡 CI workflow runs typecheck, tests and build for both apps against a Postgres service *(`.github/workflows/ci.yml`; not yet run on GitHub)*
- [ ] 🟢 `Dockerfile` for the API
- [ ] 🟢 Redis, Socket.IO and file storage deferred to the notification and document stories

---

### Sign-off

| Reviewer | Date | All 🔴 items ticked? | Notes |
| -------- | ---- | -------------------- | ----- |
|          |      |                      |       |
