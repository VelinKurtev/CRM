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
| `GET /contacts/{id}/overview` | `contacts:read` | The contact with its activities, tasks, emails and notes (first 50 of each; a section you may not read is `null`) |
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
| `GET /pipelines` | `deals:read` | Pipelines with their stages in order, default first, with how many deals each stage and pipeline holds |
| `POST /pipelines` | `settings:manage` | Create a pipeline (starts with the standard stages) |
| `PATCH /pipelines/{id}` | `settings:manage` | Rename, or `isDefault: true` to make it the default |
| `DELETE /pipelines/{id}` | `settings:manage` | Delete (not the default, not one with deals) |
| `POST /pipelines/{id}/stages` | `settings:manage` | Add a stage (`kind` open, won or lost; `probability`; optional `position`) |
| `PATCH /pipelines/{id}/stages/{stageId}` | `settings:manage` | Rename, change probability or `kind`; a kind change updates the stage's deals |
| `PUT /pipelines/{id}/stages/order` | `settings:manage` | Put the stages in order: every id, once |
| `DELETE /pipelines/{id}/stages/{stageId}` | `settings:manage` | Delete a stage; `?moveDealsTo=` is needed if it holds deals |
| `GET /pipelines/{id}/board` | `deals:read` | A pipeline as a board: each stage with its deal count, total value and its 50 most recently changed deals. A card is moved with `PATCH /deals/{id}` and a new `stageId` |
| `GET /deals` | `deals:read` | Deals newest first (search `q` on name or company, filter `status`, paging) |
| `GET /deals/{id}` | `deals:read` | One deal |
| `POST /deals` | `deals:write` | Create (only `title` required; starts in the default pipeline's first stage unless `stageId` is given) |
| `PATCH /deals/{id}` | `deals:write` | Update (only what you send; `null` clears the date, company or contact; a stage change reopens or closes the deal) |
| `GET /leads` | `leads:read` | Leads newest first, without converted ones unless `converted=true` (search `q`, filter `status`, `priority`, paging) with the number of leads in each stage |
| `GET /leads/{id}` | `leads:read` | One lead |
| `GET /leads/owners` | `leads:assign` | Active users a lead can be given to |
| `POST /leads/{id}/convert` | `leads:write` + `deals:write` | Turn a qualified lead into a deal (body optional: fields default from the lead; notes and tags come across; lead becomes Won and linked). All or nothing, once per lead |
| `POST /leads` | `leads:write` | Create (only `title` required; owner is the caller, another owner needs `leads:assign`) |
| `PATCH /leads/{id}` | `leads:write` | Update (only what you send; `null` clears an optional field; changing `ownerId` needs `leads:assign` and is audited) |
| `GET /leads/{id}/attachments` | `leads:read` | The lead's files (without their contents) |
| `POST /leads/{id}/attachments` | `leads:write` | Attach a file: body is the file as `application/octet-stream`, `?name=` and `?type=`; 10 MB, 25 per lead |
| `GET /leads/{id}/attachments/{attachmentId}` | `leads:read` | Download a file |
| `DELETE /leads/{id}/attachments/{attachmentId}` | `leads:write` | Remove a file |
| `POST /notes` | `notes:write` | Add a note to a contact, company or deal (exactly one of `contactId`, `companyId`, `dealId`) |
| `PATCH /notes/{id}` | `notes:write` | Edit a note (author only) |
| `DELETE /notes/{id}` | `notes:delete`, or your own | Delete a note |
| `GET /tags/details` | `contacts:read` | Tags with colour and usage counts |
| `PATCH /tags/{id}`, `DELETE /tags/{id}` | `tags:manage` | Rename or recolour; delete (removes it from every record) |
| `POST /contacts/bulk-tags` | `contacts:write` | Add and/or remove tags on up to 500 contacts, all or nothing |

The contact list and export take `tag` repeated for several tags (`?tag=a&tag=b`) and `tagMode=any|all`.

Quick-create (used by the dashboard's quick actions): `POST /leads`, `POST /deals`, `POST /tasks`, each taking only
the essentials. Deals start in the first stage of the default pipeline.

More detail on contacts: [[Contacts]].
