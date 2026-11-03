# API Readiness Checklist

Review this once **Phase 1 – Authentication & User Roles (US-004 – US-010)** is complete. These are cross-cutting API items that Phase 1 depends on or should leave behind. Tick each box when verified, and note the file or PR that implements it.

Legend: 🔴 should exist for Phase 1 to be considered done · 🟡 recommended · 🟢 can wait until later phases

---

## 1. API documentation

- [x] 🔴 Swagger UI served at `/api/docs`, raw spec at `/api/openapi.json` *(done in US-002 follow-up)*
- [ ] 🔴 Every Phase 1 endpoint is in the spec (login, register, forgot/reset password, refresh/logout, profile, change password, roles & permissions)
- [ ] 🔴 `bearerAuth` security scheme defined, so "Authorize" works in Swagger UI
- [ ] 🟡 Request and response schemas generated from the Zod schemas (e.g. `zod-to-openapi`) rather than hand-written
- [ ] 🟡 Example requests and error responses documented for each endpoint
- [ ] 🟢 Typed client generated from the spec for `crm-app` (`openapi-typescript`)

## 2. Validation & errors

- [x] 🔴 `validate(schema)` middleware for body, query and params; returns 400 with per-field errors
- [x] 🔴 Central error-handling middleware with one consistent JSON error shape
- [x] 🔴 `HttpError` helper (400/401/403/404/409) used instead of ad-hoc `res.status()` calls
- [x] 🔴 Unknown routes return a JSON 404
- [ ] 🟡 No stack traces or internal messages leak in production responses

## 3. Authentication & authorization

- [x] 🔴 Passwords hashed with bcrypt or argon2 — never stored or logged in plain text
- [x] 🔴 JWT signed with a secret from env; access-token expiry configured
- [x] 🔴 Refresh-token or session strategy implemented per US-007
- [x] 🔴 `authenticate` middleware protects all non-public routes
- [ ] 🔴 RBAC middleware (`requireRole` / `requirePermission`) enforces Admin, Sales, Manager, Support access
- [x] 🔴 Registration rejects duplicate emails (409) and validates input with Zod
- [x] 🔴 Password reset tokens are single-use and expire
- [x] 🟡 Inactive users (`isActive = false`) cannot log in
- [x] 🟡 Login does not reveal whether the email or the password was wrong

## 4. Database

- [x] 🔴 Seed script creates default roles, permissions, an admin user and a default pipeline with stages
- [x] 🔴 Seed is idempotent (safe to run twice)
- [ ] 🔴 Any schema changes from Phase 1 (e.g. reset tokens, refresh tokens) have committed migrations
- [ ] 🟡 `npm run db:seed` script exists and is documented in the README
- [ ] 🟡 Indexes exist on columns used for login and lookup (`User.email` is unique)

## 5. Security hardening

- [ ] 🔴 `helmet` security headers enabled
- [ ] 🔴 Rate limiting on login, register and forgot-password
- [ ] 🔴 CORS restricted to the configured frontend origin (not `*`)
- [ ] 🔴 No secrets committed; `.env.example` lists every required variable
- [ ] 🟡 Request body size limit set
- [ ] 🟡 Auth events (login, failed login, password change) written to `AuditLog`
- [ ] 🟢 `npm audit` reviewed

## 6. Logging & observability

- [ ] 🟡 Structured request logging (`pino` / `pino-http`) with a request ID
- [ ] 🟡 Sensitive fields (passwords, tokens, auth headers) redacted from logs
- [ ] 🟡 `/api/health` still reports DB status after the auth changes
- [ ] 🟢 Error tracking (e.g. Sentry) wired in

## 7. Testing & code quality

- [ ] 🔴 Integration tests for every Phase 1 endpoint (success, validation error, unauthorized, forbidden)
- [ ] 🔴 Tests use a separate test database, not the dev database
- [ ] 🟡 Linter configured for `crm-api` (ESLint or oxlint)
- [ ] 🟡 `npm run typecheck`, `lint`, `test` and `build` all pass for both `crm-api` and `crm-app`
- [ ] 🟢 Test coverage report

## 8. Frontend ↔ API integration

- [x] 🔴 `crm-app` axios client has a base URL from env, attaches the token and handles 401 (redirect to login / refresh)
- [x] 🔴 Protected routes in the React app redirect unauthenticated users
- [ ] 🟡 Role-based UI: menu items and actions hidden when the role lacks permission
- [ ] 🟡 API errors surface as toasts or form errors using the shared error shape

## 9. DevOps & documentation

- [ ] 🟡 Root `README` explains setup: `npm install`, `db:up`, `db:deploy`, `db:seed`, `dev` for both apps
- [ ] 🟡 CI workflow runs typecheck, tests and build for both apps against a Postgres service
- [ ] 🟢 `Dockerfile` for the API
- [ ] 🟢 Redis, Socket.IO and file storage deferred to the notification and document stories

---

### Sign-off

| Reviewer | Date | All 🔴 items ticked? | Notes |
| -------- | ---- | -------------------- | ----- |
|          |      |                      |       |
