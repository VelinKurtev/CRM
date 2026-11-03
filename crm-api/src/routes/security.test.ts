import bcrypt from 'bcryptjs'
import express from 'express'
import { pinoHttp } from 'pino-http'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { logger } from '../lib/logger.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'
import { createLimiter } from '../lib/rate-limit.js'
import { errorHandler } from '../middleware/error-handler.js'

const stamp = Date.now()
const email = `sec-${stamp}@crm.local`
const password = 'Secret123!'
let userId = ''

beforeAll(async () => {
  await syncPermissions(prisma)
  const role = await prisma.role.findUniqueOrThrow({ where: { name: 'SALES' } })
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 4),
      firstName: 'Sec',
      lastName: 'Test',
      roleId: role.id,
    },
  })
  userId = user.id
})

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: {
      OR: [{ userId }, { changes: { path: ['email'], equals: `nobody-${stamp}@crm.local` } }],
    },
  })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.$disconnect()
})

describe('HTTP hardening', () => {
  it('sends security headers and a request id', async () => {
    const res = await request(app).get('/api/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['strict-transport-security']).toBeDefined()
    expect(res.headers['x-powered-by']).toBeUndefined()
    expect(res.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/)
  })

  it('serves Swagger UI without the strict CSP that would blank it, and the API with it', async () => {
    const docs = await request(app).get('/api/docs/')
    expect(docs.status).toBe(200)
    expect(docs.headers['content-security-policy']).toBeUndefined()
    expect(docs.headers['x-content-type-options']).toBe('nosniff')
    const api = await request(app).get('/api/health')
    expect(api.headers['content-security-policy']).toContain("default-src 'self'")
  })

  it('reuses a sane incoming request id and ignores junk', async () => {
    const good = await request(app).get('/api/health').set('X-Request-Id', 'abc-12345678')
    expect(good.headers['x-request-id']).toBe('abc-12345678')
    const bad = await request(app).get('/api/health').set('X-Request-Id', 'x y\\z')
    expect(bad.headers['x-request-id']).not.toBe('x y\\z')
  })

  it('rejects oversized bodies with 413 instead of a server error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'x'.repeat(200_000) })
    expect(res.status).toBe(413)
    expect(res.body.error.message).toBe('Request body too large')
  })

  it('only allows the configured frontend origin', async () => {
    const ok = await request(app).get('/api/health').set('Origin', 'http://localhost:5173')
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    const other = await request(app).get('/api/health').set('Origin', 'https://evil.example')
    // Always the configured origin, never a wildcard or the caller's: a browser on another site is refused.
    expect(other.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })

  it('never leaks internals in a 500', async () => {
    const broken = express()
    broken.use(pinoHttp({ logger }))
    broken.get('/boom', () => {
      throw new Error('connection to db-internal.corp:5432 refused')
    })
    broken.use(errorHandler)
    const res = await request(broken).get('/boom')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: { message: 'Internal server error' } })
    expect(JSON.stringify(res.body)).not.toMatch(/db-internal|stack|at /)
  })
})

describe('rate limiting', () => {
  it('answers 429 in the standard error shape once the limit is hit', async () => {
    const limited = express()
    limited.get('/try', createLimiter({ limit: 2, enforceInTests: true }), (_req, res) => {
      res.json({ ok: true })
    })
    expect((await request(limited).get('/try')).status).toBe(200)
    expect((await request(limited).get('/try')).status).toBe(200)
    const res = await request(limited).get('/try')
    expect(res.status).toBe(429)
    expect(res.body.error.message).toMatch(/Too many attempts/)
    expect(res.headers['ratelimit-policy']).toBeDefined()
  })
})

describe('auth audit trail', () => {
  const events = () =>
    prisma.auditLog.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })

  it('records successful and failed sign-ins without revealing why to the client', async () => {
    const bad = await request(app).post('/api/auth/login').send({ email, password: 'Wrong123!' })
    expect(bad.status).toBe(401)
    expect(bad.body.error.message).toBe('Invalid email or password')
    const good = await request(app).post('/api/auth/login').send({ email, password })
    expect(good.status).toBe(200)

    const [failed, ok] = await events()
    expect(failed).toMatchObject({ action: 'LOGIN_FAILED', changes: { reason: 'bad_password' } })
    expect(ok.action).toBe('LOGIN')
    expect(JSON.stringify([failed, ok])).not.toMatch(/Wrong123|Secret123/)
  })

  it('records attempts on unknown emails with no user attached', async () => {
    const unknown = `nobody-${stamp}@crm.local`
    await request(app).post('/api/auth/login').send({ email: unknown, password })
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'LOGIN_FAILED', changes: { path: ['email'], equals: unknown } },
    })
    expect(row.userId).toBeNull()
    expect(row.changes).toMatchObject({ reason: 'unknown_email' })
  })

  it('records password changes', async () => {
    const login = await request(app).post('/api/auth/login').send({ email, password })
    const res = await request(app)
      .post('/api/users/me/password')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ currentPassword: password, newPassword: 'Another123!' })
    expect(res.status).toBe(200)
    expect((await events()).map((e) => e.action)).toContain('PASSWORD_CHANGE')
  })
})
