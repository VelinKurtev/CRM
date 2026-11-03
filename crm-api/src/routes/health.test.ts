import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { prisma } from '../lib/prisma.js'

afterAll(() => prisma.$disconnect())

describe('GET /api/health', () => {
  it('responds ok when the database is reachable', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' })
  })
})

describe('API docs', () => {
  it('serves the OpenAPI spec and Swagger UI', async () => {
    const spec = await request(app).get('/api/openapi.json')
    expect(spec.status).toBe(200)
    expect(spec.body.paths['/health']).toBeDefined()

    const ui = await request(app).get('/api/docs/')
    expect(ui.status).toBe(200)
    expect(ui.text).toContain('swagger-ui')
  })
})
