# Security and Operations

## Configuration

API variables (`crm-api/.env`; `.env.example` lists them all):

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | required | PostgreSQL connection |
| `JWT_SECRET` | required, 16+ characters | Signs access tokens. Use a long random value in production |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Refresh token lifetime |
| `RESET_TOKEN_TTL_MINUTES` | `60` | Password reset link lifetime |
| `PORT` | `4000` | API port |
| `CORS_ORIGIN` | `http://localhost:5173` | The one frontend origin allowed. `*` is refused at startup |
| `APP_URL` | `http://localhost:5173` | Used to build links in emails |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Mailpit in dev | Outgoing email |
| `NODE_ENV` | `development` | `production` turns on `Secure` cookies |
| `LOG_LEVEL` | `info` (`silent` under test) | Log detail |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | `admin@crm.local`, `Admin123!` | Used by `db:seed` |
| `TEST_DATABASE_URL` | `…/crm_test` | Database for tests (name must end in `_test`) |

Web app: `VITE_API_URL` (default `http://localhost:4000/api`).

## What protects the API

- **Headers:** helmet on everything; the Swagger page alone gets a relaxed content-security-policy, because it needs
  inline scripts.
- **Rate limiting:** sign-in, registration and password-reset endpoints, 20 requests per 15 minutes per IP.
- **Body size:** 100 KB for JSON, 2 MB for CSV import; larger gets a 413.
- **CORS:** one origin only, with credentials.
- **Errors:** an unexpected error returns a generic 500. The details go to the log, never the response.
- **Passwords and tokens:** hashed (bcrypt for passwords; SHA-256 for refresh and reset tokens). Never logged.
- **Spreadsheet formulas** in exported CSVs are neutralised.

## Logging and audit

- **Request logs** are structured JSON (pino), one short line per request with a request id. The same id is returned
  in the `X-Request-Id` response header, so a user's error report can be matched to the log. Authorization headers,
  cookies and password/token fields are redacted.
- **Audit log** (table `AuditLog`) records: sign-ins and failures, password changes and resets, role changes, contact
  deletes, imports and exports. Failed sign-ins keep the real reason (unknown email, wrong password, inactive
  account) even though the person only ever sees "Invalid email or password".

## Production notes

- Set a strong `JWT_SECRET`, `NODE_ENV=production`, and `CORS_ORIGIN` / `APP_URL` to the real frontend address.
- Behind a reverse proxy or load balancer, configure Express `trust proxy`; otherwise rate limiting and audit logs see
  the proxy's address instead of the client's.
- Run `npm run db:deploy` (not `db:migrate`) to apply migrations, and `npm run db:seed` once on a new database.
- Change the seeded admin password straight away.
- `GET /api/health` reports the database status, for load balancer checks.

## Not done yet

Redis, websockets, file storage, a Dockerfile for the API, error tracking, and generating the API docs from the
validation schemas. They are tracked in `CRM-API-Readiness-Checklist.md`.
