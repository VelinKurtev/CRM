# Development Workflow

## Stories

Work follows `CRM-User-Stories.md`: stories are numbered (US-001 …) and ordered by the build plan. Each story is
built, tested, ticked off, and committed as **`US-0NN – Short title`**.

**Progress bars:** the top of `CRM-User-Stories.md` shows overall and per-phase progress, generated from the ticked
boxes. After ticking a story run:

```bash
node scripts/update-progress.mjs          # refresh the bars
node scripts/update-progress.mjs --check  # verify they are current (exit 1 if not)
```

## Definition of done

Both apps pass, from each folder:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

and `npx prettier --check .` is clean. New behaviour has tests: for the API, success, validation error,
unauthorised and forbidden cases; for the app, what the user sees and does.

## Adding a feature: the usual route

1. **Schema:** edit `crm-api/prisma/schema.prisma`, run `npm run db:migrate`, then `npx prisma generate`.
2. **Permissions:** if it needs a new one, add it to `crm-api/src/lib/permissions.ts` and its test.
3. **API:** a router in `src/routes/`, validated with Zod, guarded with `requirePermission(...)`, mounted in `app.ts`,
   documented in `src/openapi.ts`.
4. **App:** a service function in `src/services/`, a page or component in `src/features/<area>/`, a route in
   `src/routes/index.tsx` (with a `handle: { crumb }` for breadcrumbs), a sidebar item if it needs one.
5. **Tests** for both sides.

## Conventions

- **Formatting:** Prettier (`npm run format`). **Lint:** oxlint.
- **Validation:** Zod on the server; the same rules back every way of creating a record.
- **Permissions:** enforce in the API first; use `<Can permission="…">` and `usePermission` in the app only to hide
  what a person can't use.
- **Errors:** throw `HttpError(status, message, fieldErrors?)`; the error handler produces the standard shape.
- **Sensitive actions** (sign-ins, deletes, imports, exports, role changes) write to the audit log.
- **Prisma 7 gotcha:** `migrate dev` does not regenerate the client. Run `npx prisma generate` afterwards, or the new
  columns will be unknown at runtime even though the types look fine.
