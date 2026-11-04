# Architecture

```
Browser (React app)  ──HTTP + JSON──▶  Express API  ──Prisma──▶  PostgreSQL
   │                                     │
   └─ access token in memory             ├─ validates with Zod
      refresh token in httpOnly cookie   ├─ checks permissions on every request
                                         └─ writes security events to the audit log
```

## crm-api

| Folder | Holds |
| --- | --- |
| `src/routes/` | One router per area: `auth`, `users`, `contacts`, `contacts-import`, `contacts-export`, `dashboard`, `quick-create`, `health` |
| `src/middleware/` | `authenticate`, `authorize` (permissions), `validate` (body and query), error handling |
| `src/lib/` | Shared logic: permissions matrix, sessions, JWT, audit log, rate limits, CSV reading and writing, contact filters |
| `prisma/` | Schema, migrations, seed |
| `src/test/` | Test database setup and CSV fixtures |

**Stack:** Express 5, Prisma 7 with the `pg` adapter, PostgreSQL 16, Zod 4, bcryptjs, jsonwebtoken, pino, helmet,
express-rate-limit, csv-parse. Tests: Vitest and supertest. Lint: oxlint.

## crm-app

| Folder | Holds |
| --- | --- |
| `src/features/` | One folder per area (`auth`, `admin`, `contacts`, `dashboard`, `profile`, `quick-actions`) with its pages, forms and tests |
| `src/components/ui/` | Shared building blocks (Button, Table, Form, Modal, Pagination, Filters, and so on) |
| `src/components/layout/` | Sidebar, navbar, breadcrumbs, footer |
| `src/services/` | Functions that call the API |
| `src/routes/` | Route table and guards |
| `src/store/` | Zustand stores: signed-in user (memory only) and UI state |

**Stack:** React 19, TypeScript, Vite, Tailwind 4, shadcn/ui (Radix), React Router 7, TanStack Query, Zustand,
React Hook Form with Zod. Tests: Vitest and Testing Library.

## Decisions worth knowing

- **The API is the authority on permissions.** The app hides buttons and pages a role can't use, but that is only a
  hint; the API checks every request. Permissions are read from the database on each request, so changing someone's
  role takes effect immediately, without waiting for their token to expire.
- **Tokens:** a short-lived access token is kept in memory only (never `localStorage`); a longer-lived refresh token
  sits in an httpOnly cookie. See [[Authentication and Sessions]].
- **One set of validation rules.** The contact create form, edit form and CSV import all use the same Zod schema on
  the server.
- **The URL holds list state.** Search, filters, sort and page live in the address, so refresh, back and shared links
  keep them.
- **Preview before commit.** The CSV import has a no-save mode that the page uses for its preview, so the preview
  and the real import cannot disagree.
- **The list and the export share their filter code,** so "matching your search" means the same thing in both.
