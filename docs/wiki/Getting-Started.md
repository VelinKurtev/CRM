# Getting Started

## You need

- Node.js 24
- Docker (runs PostgreSQL and a local mail catcher)

## First-time setup

```bash
# API
cd crm-api
cp .env.example .env        # then set JWT_SECRET to a long random string
npm install
npm run db:up               # PostgreSQL on port 5433 and Mailpit, via Docker
npm run db:deploy           # apply migrations
npm run db:seed             # roles, permissions, default pipeline, admin user
npm run dev                 # http://localhost:4000

# Web app (second terminal)
cd crm-app
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

Sign in with the seeded admin: `admin@crm.local` / `Admin123!` (set `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` before seeding to change it). Change the password after your first sign-in.

## Where things are

| What | Address |
| --- | --- |
| Web app | http://localhost:5173 |
| API | http://localhost:4000/api |
| API docs (Swagger UI) | http://localhost:4000/api/docs |
| Caught emails (password reset) | http://localhost:8025 |
| PostgreSQL | `localhost:5433`, database `crm`, user `crm` |

## Everyday commands

Run in `crm-api` or `crm-app`:

| Command | Does |
| --- | --- |
| `npm run dev` | Start with reload |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | oxlint |
| `npm test` | Run the tests |
| `npm run build` | Production build |
| `npm run format` | Prettier |

API only:

| Command | Does |
| --- | --- |
| `npm run db:migrate` | Create a migration after editing `schema.prisma`, then run `npx prisma generate` (Prisma 7 does not regenerate the client for you) |
| `npm run db:studio` | Browse the data in the browser |
| `npm run db:seed` | Seed again; safe to repeat |

## Trying the features

Create a few contacts, or import the sample files in `crm-api/src/test/fixtures/contacts/`
(see [[Contacts]]). To see what each role can do, change a user's role under **Users & roles** as admin.
