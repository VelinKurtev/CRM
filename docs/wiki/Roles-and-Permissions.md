# Roles and Permissions

Four roles. Admins assign them under **Users & roles**. A role is a list of permissions written `area:action`; the
single source of truth is `crm-api/src/lib/permissions.ts`, which is synced to the database each time the API starts.

| Area | Admin | Manager | Sales | Support |
| --- | --- | --- | --- | --- |
| `contacts` | read, write, delete, delete_own, export | read, write, delete, export | read, write, delete_own | read |
| `companies` | read, write, delete | read, write, delete | read, write | read |
| `leads` | read, write, delete | read, write, delete | read, write | — |
| `deals` | read, write, delete | read, write, delete | read, write | read |
| `tasks` | read, write, delete | read, write, delete | read, write, delete | read, write |
| `activities` | read, write, delete | read, write, delete | read, write, delete | read, write |
| `notes` | read, write, delete | read, write, delete | read, write, delete | read, write |
| `documents` | read, write, delete | read, write, delete | read, write | read |
| `emails` | read, write, delete | read, write, delete | read, write | read, write |
| `reports` | read | read | — | — |
| `users` | read, manage | read | — | — |
| `audit` | read | — | — | — |
| `settings` | manage | — | — | — |

Notes: `contacts:delete_own` lets a person delete contacts they own (Admins and Managers already have `delete` for any).
`reports:read` includes the dashboard revenue chart. `users:manage` assigns roles.
This table is generated from the matrix in the code, so it is exact as of the last update.

## Rules worth remembering

- New self-registered accounts start as **Support**, the least-privileged role.
- An admin can't change their own role, so the last admin can't lock everyone out.
- **Sales can delete a contact only if they own it.** Ownership is whoever created or imported it.
- The app hides buttons and pages a role can't use, and the API refuses the request regardless.

## Changing the matrix

Edit `ROLE_PERMISSIONS` in `permissions.ts`, update `permissions.test.ts`, and restart the API. Users pick up a changed
role on their next request.
