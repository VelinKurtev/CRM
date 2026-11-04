# CRM

A CRM built with React (`crm-app`) and an Express + Prisma + PostgreSQL API (`crm-api`).

| Folder | What it is |
| --- | --- |
| `crm-api` | REST API (Express 5, Prisma, PostgreSQL, JWT auth with refresh cookies) |
| `crm-app` | Web app (React, Vite, Tailwind, shadcn/ui, TanStack Query) |

User stories live in `CRM-User-Stories.md`, which opens with a progress bar for each phase (after ticking a story, run `node scripts/update-progress.mjs` to refresh it; add `--check` to verify it in CI); cross-cutting API items in `CRM-API-Readiness-Checklist.md`.

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

API only: `npm run db:migrate` (create a migration after editing `schema.prisma`; then run `npx prisma generate`, because Prisma 7 no longer regenerates the client for you), `npm run db:studio`
(browse the data), `npm run db:seed` (safe to run repeatedly).

## Tests

API tests use their own database, `crm_test`, which is created and migrated automatically the first
time you run `npm test`, so they never touch your development data. The database name must end in
`_test`; the test run refuses to start otherwise. Set `TEST_DATABASE_URL` to use a different server.

## Importing contacts

Contacts → **Import CSV** takes a CSV file with a header row (`first_name` and `last_name` are required;
see the page for the optional columns, or download its template). It checks the file first and shows what
would be imported and which rows would be skipped and why; nothing is saved until you confirm. Excel's
semicolon-separated exports work too.

Sample files for trying it, which the API tests also use, are in
`crm-api/src/test/fixtures/contacts/`:

| File | What it shows |
| --- | --- |
| `valid.csv` | Every row imports: quoted cells, a multi-line note, Cyrillic text, blank cells |
| `with-errors.csv` | Good rows import; bad ones are reported by row (missing name, bad email or link, duplicates, too many tags) |
| `valid-excel-semicolon.csv` | Excel-style: BOM, `;` separators, Windows line endings, friendly headers |
| `missing-columns.csv`, `unclosed-quote.csv`, `header-only.csv` | Files that are refused outright |

## Exporting contacts

Managers and admins get an **Export** button on the Contacts page. It downloads every contact matching the
current search and filters (not just the visible page) as a CSV, up to 10,000 at a time. Use the
"for Excel (semicolons)" option if Excel opens the file as a single column. The columns match the import
format, so an export can be edited and imported elsewhere. Notes are not included, and every export is
recorded in the audit log.

## Tags

Tag contacts on their form, then filter the list by one or more tags (any or all), or click a tag in the list.
Tick rows to add or remove tags on many contacts at once. Managers and admins get a **Tags** page to rename,
recolour or delete tags.

## Contact page

Click a contact's name for their page: details, tags and links, then their activities, tasks, emails and notes
in one place.

## Notes

Contact and company pages have a **Notes** section: write a note (preferences, budget, anything worth keeping),
and edit or delete it later. See the wiki's Notes page for who can do what.

## Companies

**Companies** in the sidebar lists organizations (search by name or industry). Sales users and above can add and
edit them: name (required), industry, employees, annual revenue in USD and website. Names are unique whatever
their letter case. Click a name for the company page: its contacts, deals and notes in one place. Contacts still link to a company by name on their form.

## Wiki

The project wiki is written in `docs/wiki/` (reviewed with the code). A workflow (`.github/workflows/wiki.yml`)
publishes it to the GitHub wiki whenever those files change on `main`; `scripts/publish-wiki.sh` does the same by hand.
Edit the pages in the repo, not on GitHub, because each publish replaces the wiki's contents.

## Production notes

- Set a strong `JWT_SECRET`, `NODE_ENV=production`, and `CORS_ORIGIN` / `APP_URL` to the real frontend URL.
- Behind a reverse proxy or load balancer, configure Express `trust proxy` so rate limiting and audit
  logs see the client's real IP rather than the proxy's.
- Sign-in, registration and password-reset endpoints are rate limited (20 requests / 15 minutes per IP).
