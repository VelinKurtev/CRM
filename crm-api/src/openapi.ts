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
  tags: [{ name: 'System' }, { name: 'Auth' }, { name: 'Users' }, { name: 'Dashboard' }],
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
