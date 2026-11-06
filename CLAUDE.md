# CRM: notes for Claude

A CRM built story by story from `CRM-User-Stories.md`. Two apps: `crm-api` (Express 5, Prisma 7, PostgreSQL, Zod,
Vitest + supertest) and `crm-app` (React 19, Vite, TanStack Query, react-hook-form + Zod, Tailwind/Radix, Vitest +
Testing Library). Setup and everyday commands are in `README.md`; the workflow and definition of done are in
`docs/wiki/Development-Workflow.md`. Read those instead of rediscovering them.

## Before you start a story

- Take the story text from `CRM-User-Stories.md`. State sensible defaults and keep going; ask only when a decision
  really changes what gets built.
- **Copy an existing feature instead of exploring:** `companies` is the simplest CRUD (`crm-api/src/routes/companies.ts`,
  `crm-app/src/features/companies/`). `leads` adds files, stages and assignment, `deals` adds record pickers and a board,
  `admin/pipelines` is an admin screen. Open the closest one and mirror it.
- Keep to the story. Extras (bulk actions, filters, notifications) go in the summary as offers, not in the diff.

## Doing a story

1. **Schema:** edit `crm-api/prisma/schema.prisma` and add `prisma/migrations/<timestamp>_name/migration.sql` (writing the
   SQL by hand is fine). Then `npx prisma generate`, check
   `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` says no difference,
   and apply it to the dev database with `npm run db:deploy`. Tell the user to restart `npm run dev` in `crm-api`, or
   they get "internal server error" from the stale client.
2. **API:** router in `src/routes/` (Zod validation, `requirePermission`, `HttpError`), mounted in `src/app.ts`, plus
   `src/openapi.ts`. New permissions go in `src/lib/permissions.ts` and its test.
3. **App:** service in `src/services/`, page in `src/features/<area>/`, route in `src/routes/index.tsx` (with a
   `handle: { crumb }`), sidebar item in `src/components/layout/nav-items.ts`.
4. **Tests on both sides** (success, validation, unauthorised, forbidden for the API; what the user sees and does for
   the app).
5. **Docs:** a section in `README.md`, the wiki page in `docs/wiki/` (plus `Home.md`, `_Sidebar.md`,
   `API-Reference.md`, and `Roles-and-Permissions.md` if permissions changed), tick the story in
   `CRM-User-Stories.md` with a sub-bullet or two, then run `node scripts/update-progress.mjs`. That script **writes
   the file whatever flags you pass** (only `--check` is read-only), and CI fails if the progress bars are stale.
6. **Done means, in both `crm-api` and `crm-app`:**
   `npm run typecheck && npm run lint && npm test && npm run build` and `npx prettier --check .`.
   Commit only when asked, with the message `US-0NN – Short title`.

## Keeping a session cheap

- While iterating, run only the tests for the files you touched (`npx vitest run path/to/file`). Run each full suite
  once at the end.
- Read only the part of a file you need, and trim command output (`| tail`, `grep`). Don't re-read a file you just edited.
- Edit with the Edit tool or check the current text first. Prettier rewraps lines, so a scripted find-and-replace
  on text you remember often misses.
- Keep the final summary short: what exists, what you applied to the dev database, and the decisions to confirm.

## Gotchas that have cost time

- **API tests share one database across files that run in parallel.** Name test data with a `stamp` and delete it in
  `afterAll`. A test that changes global state (the default pipeline, permissions) must put it back.
- **`vi.mock('@/services/x')` automocks every export, and arrays and objects become empty.** Keep constants and option
  lists in a separate module (`services/lead-options.ts`, `features/*/schemas.ts`), never in a service file that tests mock.
- **Prefer native `<select>` in forms and table rows.** They are accessible and easy to test; Radix `Select` is awkward
  in jsdom.
- **Dates:** a deal's expected close is stored as end of day UTC. Show it with `formatCalendarDate`, not
  `formatDate`, or it can appear a day late east of UTC.
- **Dropdown lists inside a form** (the record picker) need `onMouseDown={e => e.preventDefault()}` on the list, because
  Safari and Firefox on macOS don't focus a button on click, so the input blurs and the list closes before the click.
- **File uploads** are raw bodies sent as `application/octet-stream` (the global JSON parser would otherwise take
  `application/json` files). Files live in Postgres, so never select the `data` column in list queries.
- **Permissions are read from the database on every request**, and synced from `permissions.ts` when the API starts.
  Deleting or reordering things that deals depend on (stages, pipelines) must keep deals consistent: see
  `src/lib/deal-stage.ts` and `src/routes/pipelines.ts`.
- **Prisma 7:** `migrate dev` doesn't regenerate the client, and the generated client is git-ignored.
- **Formatting:** `npx prettier --check .` is only meaningful inside `crm-api` or `crm-app`. Run from the repo root it
  also flags wiki pages and other files that were never formatted that way, which is not a regression.
- The dev database is `crm` on port 5433. Tests use `crm_test`, created and migrated automatically.
