import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { app } from '../app.js'
import { prisma } from '../lib/prisma.js'

vi.mock('../lib/mailer.js', () => ({ sendMail: vi.fn() }))

const email = `session-test-${Date.now()}@crm.local`
const password = 'Secret123!'

beforeAll(async () => {
  const role = await prisma.role.upsert({
    where: { name: 'SALES' },
    update: {},
    create: { name: 'SALES' },
  })
  await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 4),
      firstName: 'Sess',
      lastName: 'Ion',
      roleId: role.id,
    },
  })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } })
  await prisma.$disconnect()
})

const cookieHeader = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('crm_refresh='))!
const cookieValue = (res: request.Response) => cookieHeader(res).split(';')[0]

const login = () => request(app).post('/api/auth/login').send({ email, password })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('refresh cookie', () => {
  it('is set httpOnly, strict and scoped to /api/auth on login', async () => {
    const res = await login()
    const c = cookieHeader(res)
    expect(c).toMatch(/HttpOnly/i)
    expect(c).toMatch(/SameSite=Strict/i)
    expect(c).toMatch(/Path=\/api\/auth/i)
    // The refresh token must not leak into the JSON body.
    expect(JSON.stringify(res.body)).not.toContain(cookieValue(res).split('=')[1])
  })
})

describe('POST /api/auth/refresh', () => {
  it('returns a new access token and rotates the cookie', async () => {
    const first = await login()
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(first))
    expect(res.status).toBe(200)
    expect(res.body.token).toEqual(expect.any(String))
    expect(res.body.user.email).toBe(email)
    expect(cookieValue(res)).not.toBe(cookieValue(first))

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.token}`)
    expect(me.status).toBe(200)
  })

  it('rejects requests without a cookie', async () => {
    expect((await request(app).post('/api/auth/refresh')).status).toBe(401)
  })

  it('rejects an unknown token', async () => {
    const res = await request(app).post('/api/auth/refresh').set('Cookie', 'crm_refresh=junk')
    expect(res.status).toBe(401)
  })

  it('rejects an expired token', async () => {
    const first = await login()
    await prisma.refreshToken.updateMany({
      where: { user: { email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(first))
    expect(res.status).toBe(401)
  })

  it('revokes the whole session when an old token is replayed late', async () => {
    const first = await login()
    const second = await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(first))
    expect(second.status).toBe(200)

    // Pretend the rotation happened a while ago, then replay the old token.
    await prisma.refreshToken.updateMany({
      where: { user: { email }, revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    })
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(first))
    expect(replay.status).toBe(401)

    // The newest token from that family is dead too.
    const newest = await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(second))
    expect(newest.status).toBe(401)
  })

  it('does not kill the session on an immediate double-submit (two tabs)', async () => {
    const first = await login()
    const a = await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(first))
    const b = await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(first))
    expect(a.status).toBe(200)
    expect(b.status).toBe(401)
    await sleep(0)
    const still = await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(a))
    expect(still.status).toBe(200)
  })

  it('stops working for deactivated users', async () => {
    const first = await login()
    await prisma.user.update({ where: { email }, data: { isActive: false } })
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(first))
    expect(res.status).toBe(401)
    await prisma.user.update({ where: { email }, data: { isActive: true } })
  })
})

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token and clears the cookie', async () => {
    const first = await login()
    const out = await request(app).post('/api/auth/logout').set('Cookie', cookieValue(first))
    expect(out.status).toBe(204)
    expect(cookieHeader(out)).toMatch(/crm_refresh=;/)

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(first))
    expect(res.status).toBe(401)
  })

  it('succeeds even without a session', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(204)
  })
})

describe('access token', () => {
  it('rejects a tampered token', async () => {
    const res = await login()
    const bad = res.body.token.slice(0, -2) + 'xx'
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${bad}`)
    expect(me.status).toBe(401)
  })
})

describe('password reset', () => {
  it('signs out existing sessions', async () => {
    const sent: string[] = []
    const mailer = await import('../lib/mailer.js')
    vi.mocked(mailer.sendMail).mockImplementation((async (m: { text: string }) => {
      sent.push(m.text)
    }) as unknown as typeof mailer.sendMail)

    const first = await login()
    await request(app).post('/api/auth/forgot-password').send({ email })
    const token = /token=([a-f0-9]+)/.exec(sent.at(-1)!)![1]
    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'Brand-New-9Pass' })
    expect(reset.status).toBe(200)

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(first))
    expect(res.status).toBe(401)
  })
})
