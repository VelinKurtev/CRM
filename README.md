# CRM

A CRM built with React (`crm-app`) and an Express + Prisma + PostgreSQL API (`crm-api`).

| Folder | What it is |
| --- | --- |
| `crm-api` | REST API (Express 5, Prisma, PostgreSQL, JWT auth with refresh cookies) |
| `crm-app` | Web app (React, Vite, Tailwind, shadcn/ui, TanStack Query) |

User stories live in `CRM-User-Stories.md`; cross-cutting API items in `CRM-API-Readiness-Checklist.md`.

## Prerequisites

- Node.js 24
- Docker (for PostgreSQL and a local mail catcher)

## First-time setup

```bash
# 1. API
cd crm-api
cp .env.example .env          # then set JWT_SECRET to a long random string
npm install
npm run db:up                 # starts PostgreSQL (port 5433) and Mailpit via Docker
npm run db:deploy             # applies the migrations
npm run db:seed               # roles, permissions, default pipeline and an admin user
npm run dev                   # http://localhost:4000

# 2. Web app (second terminal)
cd crm-app
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

Sign in with the seeded admin: `admin@crm.local` / `Admin123!` (override with `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` before seeding). Change the password after first sign-in.

- API docs (Swagger UI): http://localhost:4000/api/docs
- Emails sent by the API (e.g. password reset) appear in Mailpit: http://localhost:8025

## Everyday commands

Run these in `crm-api` or `crm-app`:

| Command | Does |
| --- | --- |
| `npm run dev` | Start with reload |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | oxlint |
| `npm test` | Run the tests |
| `npm run build` | Production build |
| `npm run format` | Prettier |

API only: `npm run db:migrate` (create a migration after editing `schema.prisma`), `npm run db:studio`
(browse the data), `npm run db:seed` (safe to run repeatedly).

## Tests

API tests use their own database, `crm_test`, which is created and migrated automatically the first
time you run `npm test`, so they never touch your development data. The database name must end in
`_test`; the test run refuses to start otherwise. Set `TEST_DATABASE_URL` to use a different server.

## Production notes

- Set a strong `JWT_SECRET`, `NODE_ENV=production`, and `CORS_ORIGIN` / `APP_URL` to the real frontend URL.
- Behind a reverse proxy or load balancer, configure Express `trust proxy` so rate limiting and audit
  logs see the client's real IP rather than the proxy's.
- Sign-in, registration and password-reset endpoints are rate limited (20 requests / 15 minutes per IP).
