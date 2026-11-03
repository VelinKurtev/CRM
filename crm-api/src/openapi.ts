/** OpenAPI 3 description of the API. Add new paths here as endpoints are built. */
export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'CRM API',
    version: '1.0.0',
    description: 'REST API for the CRM application.',
  },
  servers: [{ url: '/api' }],
  tags: [{ name: 'System' }],
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
  },
  components: {
    schemas: {
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
