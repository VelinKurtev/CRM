# API Reference

The API lives under `/api`. The full, interactive reference (request and response shapes, Try it out) is the
Swagger UI at **http://localhost:4000/api/docs**; the raw spec is at `/api/openapi.json`. This page is the map.

- Send `Authorization: Bearer <access token>` on everything except the public endpoints.
- Errors share one shape: `{ "error": { "message": "…", "details": { "field": "message" } } }`. `details` appears on
  validation errors (400), one message per field.
- Status codes: 400 validation, 401 not signed in, 403 not allowed, 404 not found, 409 duplicate, 413 body too large,
  429 too many attempts.

## System and sign-in

| Endpoint | Needs | Purpose |
| --- | --- | --- |
| `GET /health` | public | Is the API up and the database reachable |
| `POST /auth/register`, `/login`, `/refresh`, `/logout` | public | See [[Authentication and Sessions]] |
| `POST /auth/forgot-password`, `/reset-password` | public | Password reset |
| `GET /auth/me` | signed in | Current user and permissions |

## Users and roles

| Endpoint | Needs | Purpose |
| --- | --- | --- |
| `GET`, `PATCH /users/me` | signed in | Your profile (name, avatar) |
| `POST /users/me/password` | signed in | Change your password |
| `GET /users` | `users:manage` | List and search users |
| `PATCH /users/{id}/role` | `users:manage` | Assign a role (not your own) |
| `GET /roles` | `users:manage` | Roles and their permissions |

## Dashboard

| Endpoint | Needs | Purpose |
| --- | --- | --- |
| `GET /dashboard/summary` | signed in | Sales overview, new leads, open deals (a section is `null` if the role can't read it) |
| `GET /dashboard/revenue` | `reports:read` | Revenue won per month, last 12 months |
| `GET /dashboard/attention` | signed in | Your open tasks, latest team activity, your notifications |

## Contacts and related

| Endpoint | Needs | Purpose |
| --- | --- | --- |
| `GET /contacts` | `contacts:read` | List with search, filters, sort and paging |
| `POST /contacts` | `contacts:write` | Create |
| `GET /contacts/{id}` | `contacts:read` | One contact, with what deleting it would affect and whether you may delete it |
| `PATCH /contacts/{id}` | `contacts:write` | Update (only what you send; `null` clears a field) |
| `DELETE /contacts/{id}` | `contacts:delete`, or `contacts:delete_own` for your own | Delete |
| `POST /contacts/import` | `contacts:write` | Import CSV (`?dryRun=true` to preview) |
| `GET /contacts/export` | `contacts:export` | Download CSV of what matches the filters |
| `GET /companies`, `GET /tags` | `companies:read`, `contacts:read` | Suggestions and filter options |
| `GET /companies/details` | `companies:read` | Companies with industry, employees, revenue, website and counts (search, paging) |
| `GET /companies/{id}` | `companies:read` | One company |
| `GET /companies/{id}/overview` | `companies:read` | The company with its contacts, deals and notes (first 50 of each; a section you may not read is `null`) |
| `POST /companies` | `companies:write` | Create (only `name` required; names unique ignoring case) |
| `PATCH /companies/{id}` | `companies:write` | Update (only what you send; `null` clears an optional field) |
| `GET /tags/details` | `contacts:read` | Tags with colour and usage counts |
| `PATCH /tags/{id}`, `DELETE /tags/{id}` | `tags:manage` | Rename or recolour; delete (removes it from every record) |
| `POST /contacts/bulk-tags` | `contacts:write` | Add and/or remove tags on up to 500 contacts, all or nothing |

The contact list and export take `tag` repeated for several tags (`?tag=a&tag=b`) and `tagMode=any|all`.

Quick-create (used by the dashboard's quick actions): `POST /leads`, `POST /deals`, `POST /tasks`, each taking only
the essentials. Deals start in the first stage of the default pipeline.

More detail on contacts: [[Contacts]].
