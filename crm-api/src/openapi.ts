/** OpenAPI 3 description of the API. Add new paths here as endpoints are built. */
export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'CRM API',
    version: '1.0.0',
    description: 'REST API for the CRM application.',
  },
  servers: [{ url: '/api' }],
  tags: [{ name: 'System' }, { name: 'Auth' }],
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
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in with email and password',
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
          role: { type: 'string', enum: ['ADMIN', 'SALES', 'MANAGER', 'SUPPORT'] },
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
