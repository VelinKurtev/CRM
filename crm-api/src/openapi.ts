const messageContent = {
  'application/json': {
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  },
} as const

const userContent = {
  'application/json': {
    schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } },
  },
} as const

/** OpenAPI 3 description of the API. Add new paths here as endpoints are built. */
export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'CRM API',
    version: '1.0.0',
    description: 'REST API for the CRM application.',
  },
  servers: [{ url: '/api' }],
  tags: [
    { name: 'System' },
    { name: 'Auth' },
    { name: 'Users' },
    { name: 'Dashboard' },
    { name: 'Records' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        description: 'Reports whether the API is running and the database is reachable.',
        responses: {
          '200': {
            description: 'API and database are up',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Health' },
                example: { status: 'ok', database: 'up', uptime: 12.3 },
              },
            },
          },
          '503': {
            description: 'Database is unreachable',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Health' },
                example: { status: 'error', database: 'down' },
              },
            },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new account',
        description:
          'Creates a user with the default (least-privilege) SUPPORT role and returns a session, like login.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
              example: {
                firstName: 'Ann',
                lastName: 'Lee',
                email: 'ann@example.com',
                password: 'Secret123',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Account created',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '409': {
            description: 'Email already registered',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Request a password reset email',
        description:
          'Always responds 200 with the same message, whether or not the email has an account.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Request accepted', content: messageContent },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Set a new password using an emailed token',
        description: 'Tokens are single-use and expire.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'password'],
                properties: { token: { type: 'string' }, password: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Password updated', content: messageContent },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Get a new access token using the refresh cookie',
        description:
          'Reads the httpOnly `crm_refresh` cookie, rotates it (the old one stops working) and returns a fresh access token. Replaying an old refresh token revokes the whole session.',
        responses: {
          '200': {
            description: 'New access token',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } },
            },
          },
          '401': {
            description: 'Missing, expired or revoked refresh token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'End the session',
        description: 'Revokes the refresh token and clears the cookie. Always succeeds.',
        responses: { '204': { description: 'Logged out' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in with email and password',
        description:
          'Returns a short-lived access token (use as Bearer) and sets the httpOnly refresh cookie.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
              example: { email: 'admin@crm.local', password: 'Admin123!' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Credentials valid',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': {
            description: 'Invalid email or password',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/users/me': {
      get: {
        tags: ['Users'],
        summary: 'Get my profile',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'My profile', content: userContent },
          '401': {
            description: 'Missing, invalid or expired token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      patch: {
        tags: ['Users'],
        summary: 'Update my profile',
        description:
          'Only the fields sent are changed. Email and role cannot be changed here. An empty avatarUrl removes the avatar.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  avatarUrl: { type: 'string', nullable: true, description: 'http(s) URL' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated profile', content: userContent },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': {
            description: 'Missing, invalid or expired token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/dashboard/summary': {
      get: {
        tags: ['Dashboard'],
        summary: 'Dashboard summary',
        description:
          'Sales overview, new leads and open deals. A section is `null` when the caller lacks read access (`deals:read` for sales and open deals, `leads:read` for leads).',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Summary figures',
            content: {
              'application/json': {
                example: {
                  sales: {
                    wonThisMonth: { revenue: 42000, deals: 3 },
                    wonLastMonthRevenue: 31000,
                  },
                  newLeads: { last7Days: 5, awaitingContact: 12 },
                  openDeals: { count: 8, value: 96500 },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/dashboard/revenue': {
      get: {
        tags: ['Dashboard'],
        summary: 'Monthly revenue',
        description:
          'Revenue from won deals for each of the last 12 months, oldest first (empty months are 0). Requires `reports:read` (Manager, Admin).',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Twelve monthly buckets',
            content: {
              'application/json': {
                example: {
                  months: [
                    { month: '2026-10', revenue: 31000, deals: 4 },
                    { month: '2026-11', revenue: 42000, deals: 3 },
                  ],
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/dashboard/attention': {
      get: {
        tags: ['Dashboard'],
        summary: 'Tasks, activity and notifications',
        description:
          "The caller's open tasks (soonest due first, with open and overdue counts), the latest team activities, and the caller's own notifications (with unread count). `tasks` needs `tasks:read` and `activities` needs `activities:read`; each is `null` otherwise.",
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Up to five of each',
            content: {
              'application/json': {
                example: {
                  tasks: {
                    items: [
                      {
                        id: 'c1',
                        title: 'Call Acme',
                        status: 'TODO',
                        dueDate: '2026-11-05T09:00:00.000Z',
                      },
                    ],
                    open: 4,
                    overdue: 1,
                  },
                  activities: [
                    {
                      id: 'a1',
                      type: 'CALL',
                      subject: 'Intro call',
                      occurredAt: '2026-11-04T10:00:00.000Z',
                      user: { firstName: 'Ann', lastName: 'Lee' },
                      contact: { firstName: 'Bob', lastName: 'Ray' },
                      deal: null,
                    },
                  ],
                  notifications: {
                    items: [
                      {
                        id: 'n1',
                        type: 'task',
                        message: 'A task was assigned to you',
                        readAt: null,
                        createdAt: '2026-11-04T10:00:00.000Z',
                      },
                    ],
                    unread: 1,
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/contacts': {
      get: {
        tags: ['Records'],
        summary: 'List contacts',
        description:
          'Requires `contacts:read`. `q` matches name, email, phone, job title or company name: every word must match somewhere, so "bob acme" finds Bob at Acme. Filters combine with AND. Sorted by `sort`/`dir` with a stable tie-break, so pages never overlap.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'company', in: 'query', schema: { type: 'string' }, description: 'Company id' },
          {
            name: 'tag',
            in: 'query',
            schema: { type: 'array', items: { type: 'string' }, maxItems: 20 },
            style: 'form',
            explode: true,
            description: 'Tag name; repeat (`tag=a&tag=b`) to filter by several',
          },
          {
            name: 'tagMode',
            in: 'query',
            schema: { type: 'string', enum: ['any', 'all'], default: 'any' },
            description: 'With several tags: contacts with `any` of them, or with `all` of them',
          },
          { name: 'owner', in: 'query', schema: { type: 'string', enum: ['me'] } },
          {
            name: 'sort',
            in: 'query',
            schema: { type: 'string', enum: ['name', 'company', 'createdAt'], default: 'name' },
          },
          {
            name: 'dir',
            in: 'query',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': { description: '`{ contacts, total, page, pageSize }`' },
          '400': { description: 'Invalid query' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Records'],
        summary: 'Create contact',
        description:
          'Requires `contacts:write`. `company` is a name: an existing company (any letter case) is linked, otherwise a new one is created (needs `companies:write`). Tags are reused by name or created. `note` becomes the first note on the contact. The contact is owned by the caller.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['firstName', 'lastName'],
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  phone: { type: 'string' },
                  jobTitle: { type: 'string' },
                  company: { type: 'string' },
                  address: { type: 'string' },
                  city: { type: 'string' },
                  postalCode: { type: 'string' },
                  country: { type: 'string' },
                  linkedinUrl: { type: 'string', format: 'uri' },
                  twitterUrl: { type: 'string', format: 'uri' },
                  facebookUrl: { type: 'string', format: 'uri' },
                  tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
                  note: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created; the contact is returned with its company, tags and notes',
          },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/contacts/export': {
      get: {
        tags: ['Records'],
        summary: 'Export contacts as CSV',
        description:
          'Requires `contacts:export` (Manager, Admin). Downloads every contact matching the same `q`, `company`, `tag`, `tagMode` and `owner` filters as the list (not just one page) as a UTF-8 CSV with a BOM, using the column names the import understands plus `owner` and `created`. Notes are not included. At most 10,000 contacts per download. Spreadsheet formulas in cells are neutralised. Recorded in the audit log.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'company', in: 'query', schema: { type: 'string' }, description: 'Company id' },
          {
            name: 'tag',
            in: 'query',
            schema: { type: 'array', items: { type: 'string' }, maxItems: 20 },
            style: 'form',
            explode: true,
            description: 'Tag name; repeat (`tag=a&tag=b`) to filter by several',
          },
          {
            name: 'tagMode',
            in: 'query',
            schema: { type: 'string', enum: ['any', 'all'], default: 'any' },
            description: 'With several tags: contacts with `any` of them, or with `all` of them',
          },
          { name: 'owner', in: 'query', schema: { type: 'string', enum: ['me'] } },
          {
            name: 'delimiter',
            in: 'query',
            schema: { type: 'string', enum: ['comma', 'semicolon'], default: 'comma' },
            description: 'Use `semicolon` for Excel in locales that expect it',
          },
        ],
        responses: {
          '200': {
            description: 'The file',
            content: { 'text/csv': { schema: { type: 'string' } } },
          },
          '400': { description: 'Invalid query, or more than 10,000 matching contacts' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/contacts/import': {
      post: {
        tags: ['Records'],
        summary: 'Import contacts from CSV',
        description:
          "Requires `contacts:write`. Send the file contents as `text/csv` (max 2 MB, 2000 rows; comma, semicolon or tab separated; UTF-8). The first row is the header; `first name` and `last name` columns are required, and `email`, `phone`, `job title`, `company`, `address`, `city`, `postal code`, `country`, `linkedin`, `twitter`, `facebook`, `tags` (separated by `;` `,` or `|`) and `note` are optional. Unknown columns are ignored and listed. Rows that fail validation, repeat an email earlier in the file, or match an existing contact's email are skipped and listed under `rejected` with their row number (header = row 1); all other rows are imported, owned by the caller. Contacts without an email cannot be matched, so importing the same file twice adds them again. `dryRun=true` checks everything and saves nothing.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'dryRun', in: 'query', schema: { type: 'boolean', default: false } }],
        requestBody: {
          required: true,
          content: { 'text/csv': { schema: { type: 'string' } } },
        },
        responses: {
          '200': {
            description: 'Preview (`dryRun`), or nothing valid to import',
            content: {
              'application/json': {
                example: {
                  dryRun: true,
                  total: 3,
                  valid: 2,
                  imported: 0,
                  ignoredColumns: ['Internal ID'],
                  rejected: [
                    { row: 3, name: 'Gus', errors: { lastName: 'Last name is required' } },
                  ],
                },
              },
            },
          },
          '201': { description: 'Imported; same shape, with `imported` set' },
          '400': {
            description:
              'The file cannot be used at all (not CSV, missing name columns, empty, too many rows)',
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '413': { description: 'File larger than 2 MB' },
        },
      },
    },
    '/contacts/{id}/overview': {
      get: {
        tags: ['Records'],
        summary: 'Contact with its relationship history',
        description:
          'Requires `contacts:read`. Returns `contact` (with company, owner and tags) plus `activities` (newest first), `tasks` (unfinished first, soonest due first), `emails` and `notes` (newest first), each `{ total, items }` with the first 50. A section the caller cannot read (`activities:read`, `tasks:read`, `emails:read`, `notes:read`) is `null`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'The contact and its history' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Contact not found' },
        },
      },
    },
    '/contacts/{id}': {
      get: {
        tags: ['Records'],
        summary: 'Get contact',
        description:
          'Requires `contacts:read`. Includes company, tags, notes, counts of related records (`related`) and `canDelete` for the caller.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'The contact' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'No such contact' },
        },
      },
      patch: {
        tags: ['Records'],
        summary: 'Update contact',
        description:
          'Requires `contacts:write`. Send only what changes: a field left out is kept, `null` clears an optional field (`company: null` unlinks the company). `tags` replaces the whole tag list. Owner cannot be changed here.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                description: 'Same fields as create (except `note`); all optional, most nullable.',
              },
            },
          },
        },
        responses: {
          '200': { description: 'The updated contact' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'No such contact' },
        },
      },
      delete: {
        tags: ['Records'],
        summary: 'Delete contact',
        description:
          "Needs `contacts:delete` (Manager, Admin: any contact) or `contacts:delete_own` (Sales: contacts they own). The contact's notes, tasks, activities and tag links are deleted with it; its deals and leads stay but lose the link. Recorded in the audit log.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '204': { description: 'Deleted' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'No such contact' },
        },
      },
    },
    '/companies': {
      post: {
        tags: ['Records'],
        summary: 'Create a company',
        description:
          'Requires `companies:write`. Only `name` is required. `employees` is a whole number, `revenue` is annual with at most two decimals, `website` an http(s) link. Names are unique whatever their letter case (409). The caller becomes the owner.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CompanyInput' },
              example: {
                name: 'Acme',
                industry: 'Manufacturing',
                employees: 250,
                revenue: 12500000,
                website: 'https://acme.example.com',
              },
            },
          },
        },
        responses: {
          '201': { description: '`{ company }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '409': { description: 'A company with this name exists' },
        },
      },
      get: {
        tags: ['Records'],
        summary: 'Search companies',
        description:
          'Companies whose name contains `q`, for suggestions and filters (default 20, up to `limit` 100). Requires `companies:read`.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': { description: '`{ companies: [{ id, name }] }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/companies/details': {
      get: {
        tags: ['Records'],
        summary: 'List companies',
        description:
          'Requires `companies:read`. Companies whose name or industry contains `q`, by name, with `industry`, `employees`, `revenue`, `website`, `owner` and `contactCount` / `dealCount`. Paged (default 20, up to 100).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': { description: '`{ companies, total, page, pageSize }`' },
          '400': { description: 'Invalid query' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/companies/{id}/overview': {
      get: {
        tags: ['Records'],
        summary: 'Company with its contacts, deals and notes',
        description:
          'Requires `companies:read`. Returns `company` plus `contacts`, `deals` and `notes`, each `{ total, items }` with the first 50 (contacts by name, deals and notes newest first). `deals` also has `open`: count and total value of open deals per currency. A section the caller cannot read (`contacts:read`, `deals:read`, `notes:read`) is `null`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'The company and its related records' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Company not found' },
        },
      },
    },
    '/companies/{id}': {
      get: {
        tags: ['Records'],
        summary: 'Get a company',
        description: 'Requires `companies:read`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: '`{ company }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Company not found' },
        },
      },
      patch: {
        tags: ['Records'],
        summary: 'Edit a company',
        description:
          'Requires `companies:write`. Send only what changes: a field left out is kept, `null` clears `industry`, `employees`, `revenue` or `website`. The name cannot be cleared and must not match another company, whatever its letter case (409).',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CompanyInput' } },
          },
        },
        responses: {
          '200': { description: '`{ company }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Company not found' },
          '409': { description: 'Another company has this name' },
        },
      },
    },
    '/tags': {
      get: {
        tags: ['Records'],
        summary: 'Search tags',
        description:
          'Tag names containing `q`, for suggestions and filters (default 20, up to `limit` 100). Requires `contacts:read`.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': { description: '`{ tags: [name] }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/notes': {
      post: {
        tags: ['Records'],
        summary: 'Add a note',
        description:
          'Requires `notes:write` and read access to the record. Give exactly one of `contactId`, `companyId` or `dealId`. `body` is up to 5000 characters. The caller is the author. Notes appear in the contact and company overviews.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['body'],
                properties: {
                  body: { type: 'string', maxLength: 5000 },
                  contactId: { type: 'string' },
                  companyId: { type: 'string' },
                  dealId: { type: 'string' },
                },
              },
              example: { body: 'Prefers email. Budget around 50k.', contactId: 'abc123' },
            },
          },
        },
        responses: {
          '201': { description: '`{ note: { id, body, createdAt, updatedAt, author } }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'The contact, company or deal was not found' },
        },
      },
    },
    '/notes/{id}': {
      patch: {
        tags: ['Records'],
        summary: 'Edit a note',
        description: 'Requires `notes:write`. Only the author can edit a note.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['body'],
                properties: { body: { type: 'string', maxLength: 5000 } },
              },
            },
          },
        },
        responses: {
          '200': { description: '`{ note }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Note not found' },
        },
      },
      delete: {
        tags: ['Records'],
        summary: 'Delete a note',
        description:
          'The author can delete their own note; anyone with `notes:delete` can delete any note.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '204': { description: 'Deleted' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Note not found' },
        },
      },
    },
    '/tags/details': {
      get: {
        tags: ['Records'],
        summary: 'List tags with colour and usage',
        description:
          'Requires `contacts:read`. Every tag matching `q` (up to `limit`, default 100, max 500) with its `color` (`#rrggbb` or null), `contactCount` and `usageCount` (contacts, companies, leads and deals together).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
        ],
        responses: {
          '200': { description: '`{ tags: [{ id, name, color, contactCount, usageCount }] }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/tags/{id}': {
      patch: {
        tags: ['Records'],
        summary: 'Rename or recolour a tag',
        description:
          'Requires `tags:manage` (Manager, Admin). Send `name` and/or `color` (`#rrggbb`, or `null` to clear). A rename applies to every record that uses the tag. Names are unique whatever their letter case.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', maxLength: 50 },
                  color: { type: 'string', nullable: true, example: '#3b82f6' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '`{ tag: { id, name, color } }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Tag not found' },
          '409': { description: 'Another tag already has this name' },
        },
      },
      delete: {
        tags: ['Records'],
        summary: 'Delete a tag',
        description:
          'Requires `tags:manage` (Manager, Admin). Removes the tag from every contact, company, lead and deal that has it; the records themselves are kept. Recorded in the audit log.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '204': { description: 'Deleted' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Tag not found' },
        },
      },
    },
    '/contacts/bulk-tags': {
      post: {
        tags: ['Records'],
        summary: 'Add or remove tags on many contacts',
        description:
          'Requires `contacts:write`. Adds the `add` tags (created if new, matched whatever their letter case) and removes the `remove` tags on up to 500 contacts at once. All or nothing: if a contact would end up with more than 20 tags, nothing changes. Ids that match no contact are skipped and counted. Recorded in the audit log.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['contactIds'],
                properties: {
                  contactIds: {
                    type: 'array',
                    items: { type: 'string' },
                    minItems: 1,
                    maxItems: 500,
                  },
                  add: { type: 'array', items: { type: 'string' }, maxItems: 20 },
                  remove: { type: 'array', items: { type: 'string' }, maxItems: 20 },
                },
              },
              example: { contactIds: ['c1', 'c2'], add: ['vip'], remove: ['cold'] },
            },
          },
        },
        responses: {
          '200': { description: '`{ updated, skipped }`' },
          '400': { description: 'Validation failed, or a contact would exceed 20 tags' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/leads': {
      post: {
        tags: ['Records'],
        summary: 'Create a lead',
        description:
          'Requires `leads:write`. Only `title` is required. A new lead is `NEW` with `MEDIUM` priority and is owned by the caller unless `ownerId` names another active user. `value` is the estimated worth, up to two decimals.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LeadInput' },
              example: {
                title: 'Website redesign enquiry',
                source: 'Trade show',
                value: 15000,
                priority: 'HIGH',
                notes: 'Wants a demo next week',
              },
            },
          },
        },
        responses: {
          '201': { description: '`{ lead }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      get: {
        tags: ['Records'],
        summary: 'List leads',
        description:
          'Requires `leads:read`. Newest first. Stages run NEW → CONTACTED → QUALIFIED → PROPOSAL_SENT → NEGOTIATION → WON or LOST. `q` matches title or source. Paged (default 20, up to 100).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: [
                'NEW',
                'CONTACTED',
                'QUALIFIED',
                'PROPOSAL_SENT',
                'NEGOTIATION',
                'WON',
                'LOST',
              ],
            },
          },
          {
            name: 'priority',
            in: 'query',
            schema: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': {
            description:
              '`{ leads, total, page, pageSize, stageCounts }`: `stageCounts` is the number of leads in each stage under the current search and priority',
          },
          '400': { description: 'Invalid query' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/leads/owners': {
      get: {
        tags: ['Records'],
        summary: 'Users a lead can be assigned to',
        description:
          'Requires `leads:write`. Active users, by name: `{ owners: [{ id, firstName, lastName }] }`.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: '`{ owners }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/leads/{id}/attachments': {
      get: {
        tags: ['Records'],
        summary: 'List a lead’s files',
        description:
          'Requires `leads:read`. Oldest first, without the file contents: `{ attachments: [{ id, name, mimeType, sizeBytes, createdAt, uploadedBy }] }`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: '`{ attachments }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Lead not found' },
        },
      },
      post: {
        tags: ['Records'],
        summary: 'Attach a file to a lead',
        description:
          'Requires `leads:write`. The request body is the file itself, sent as `Content-Type: application/octet-stream`; `name` is required and `type` is the file’s real media type (default `application/octet-stream`). Up to 10 MB per file (413 above that) and 25 files per lead (409).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'name', in: 'query', required: true, schema: { type: 'string', maxLength: 200 } },
          { name: 'type', in: 'query', schema: { type: 'string', example: 'application/pdf' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
          },
        },
        responses: {
          '201': { description: '`{ attachment }`' },
          '400': { description: 'No name, or an empty or missing file' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Lead not found' },
          '409': { description: 'The lead already has 25 files' },
          '413': { description: 'The file is over 10 MB' },
        },
      },
    },
    '/leads/{id}/attachments/{attachmentId}': {
      get: {
        tags: ['Records'],
        summary: 'Download a lead’s file',
        description:
          'Requires `leads:read`. Always served as a download (`Content-Disposition: attachment`) with a sandboxing `Content-Security-Policy`.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'The file' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Attachment not found' },
        },
      },
      delete: {
        tags: ['Records'],
        summary: 'Remove a lead’s file',
        description: 'Requires `leads:write`.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '204': { description: 'Removed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Attachment not found' },
        },
      },
    },
    '/leads/{id}': {
      get: {
        tags: ['Records'],
        summary: 'Get a lead',
        description: 'Requires `leads:read`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: '`{ lead }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Lead not found' },
        },
      },
      patch: {
        tags: ['Records'],
        summary: 'Edit a lead',
        description:
          'Requires `leads:write`. Send only what changes: a field left out is kept, `null` clears `source`, `value`, `notes` or `ownerId`. The title cannot be cleared. `ownerId` must be an active user.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LeadInput' } } },
        },
        responses: {
          '200': { description: '`{ lead }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Lead not found' },
        },
      },
    },
    '/deals': {
      post: {
        tags: ['Records'],
        summary: 'Create deal',
        description:
          'Quick-create with the essential fields only. Requires `deals:write`. The deal starts in the first stage of the default pipeline (created on first use if none exists).',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string' },
                  amount: { type: 'number', minimum: 0 },
                  expectedClose: { type: 'string', format: 'date' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/tasks': {
      post: {
        tags: ['Records'],
        summary: 'Create task',
        description:
          'Quick-create with the essential fields only. Requires `tasks:write`. The task is assigned to you; due dates run to the end of that day.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string' },
                  dueDate: { type: 'string', format: 'date' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'List users',
        description: 'Requires the `users:manage` permission (Admin).',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'q',
            in: 'query',
            schema: { type: 'string' },
            description: 'Search name or email',
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': {
            description: 'A page of users',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    users: { type: 'array', items: { $ref: '#/components/schemas/User' } },
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    pageSize: { type: 'integer' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/users/{id}/role': {
      patch: {
        tags: ['Users'],
        summary: 'Assign a role to a user',
        description:
          'Requires `users:manage` (Admin). You cannot change your own role. Takes effect immediately and is written to the audit log.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['role'],
                properties: {
                  role: { type: 'string', enum: ['ADMIN', 'MANAGER', 'SALES', 'SUPPORT'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated user', content: userContent },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': {
            description: 'User not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/roles': {
      get: {
        tags: ['Users'],
        summary: 'List roles and their permissions',
        description: 'Requires `users:manage` (Admin).',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Roles',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    roles: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          permissions: { type: 'array', items: { type: 'string' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/users/me/password': {
      post: {
        tags: ['Users'],
        summary: 'Change my password',
        description:
          'Requires the current password. Signs out all other devices (their refresh tokens are revoked) and returns a fresh session for this one.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string' },
                  newPassword: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Password changed',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': {
            description: 'Missing, invalid or expired token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get the current user',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current user',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { user: { $ref: '#/components/schemas/User' } },
                },
              },
            },
          },
          '401': {
            description: 'Missing, invalid or expired token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    responses: {
      Unauthorized: {
        description: 'Missing, invalid or expired token',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Forbidden: {
        description: 'Authenticated, but the role lacks the required permission',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      ValidationError: {
        description: 'Validation failed',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
    schemas: {
      LeadInput: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', maxLength: 200 },
          source: { type: 'string', maxLength: 100, nullable: true },
          value: {
            type: 'number',
            minimum: 0,
            nullable: true,
            description: 'Estimated, 2 decimals',
          },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
          status: {
            type: 'string',
            enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'],
            default: 'NEW',
          },
          notes: { type: 'string', maxLength: 5000, nullable: true },
          ownerId: { type: 'string', nullable: true },
        },
      },
      CompanyInput: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 200 },
          industry: { type: 'string', maxLength: 100, nullable: true },
          employees: { type: 'integer', minimum: 0, nullable: true },
          revenue: {
            type: 'number',
            minimum: 0,
            nullable: true,
            description: 'Annual, 2 decimals',
          },
          website: { type: 'string', format: 'uri', nullable: true },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              details: { type: 'object', additionalProperties: { type: 'string' } },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          avatarUrl: { type: 'string', nullable: true },
          permissions: {
            type: 'array',
            items: { type: 'string' },
            description: 'e.g. contacts:write. Use these to decide what the UI shows.',
          },
          role: { type: 'string', enum: ['ADMIN', 'SALES', 'MANAGER', 'SUPPORT'] },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['firstName', 'lastName', 'email', 'password'],
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string', format: 'email' },
          password: {
            type: 'string',
            minLength: 8,
            description: 'At least 8 characters with upper-case, lower-case and a number',
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
      },
      LoginResponse: {
        type: 'object',
        properties: { token: { type: 'string' }, user: { $ref: '#/components/schemas/User' } },
      },
      Health: {
        type: 'object',
        required: ['status', 'database'],
        properties: {
          status: { type: 'string', enum: ['ok', 'error'] },
          database: { type: 'string', enum: ['up', 'down'] },
          uptime: { type: 'number', description: 'Process uptime in seconds' },
        },
      },
    },
  },
} as const
