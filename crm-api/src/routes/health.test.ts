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
