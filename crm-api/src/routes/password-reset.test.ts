import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { app } from '../app.js'
import { prisma } from '../lib/prisma.js'

const sent: { to: string; text: string }[] = []
vi.mock('../lib/mailer.js', () => ({
  sendMail: vi.fn(async (m: { to: string; text: string }) => void sent.push(m)),
}))

const email = `reset-test-${Date.now()}@crm.local`
const oldPassword = 'OldPass123'
const newPassword = 'NewPass456'

const tokenFromLastEmail = () => /token=([a-f0-9]+)/.exec(sent.at(-1)!.text)![1]

beforeAll(async () => {
  const role = await prisma.role.upsert({
    where: { name: 'SALES' },
    update: {},
    create: { name: 'SALES' },
  })
  await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(oldPassword, 4),
      firstName: 'Reset',
      lastName: 'Tester',
      roleId: role.id,
    },
  })
})

beforeEach(() => {
  sent.length = 0
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } })
  await prisma.$disconnect()
})

describe('POST /api/auth/forgot-password', () => {
  it('emails a reset link for a known account', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email })
    expect(res.status).toBe(200)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe(email)
    expect(sent[0].text).toContain('/reset-password?token=')
  })

  it('responds identically and sends nothing for an unknown account', async () => {
    const known = await request(app).post('/api/auth/forgot-password').send({ email })
    sent.length = 0
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@crm.local' })
    expect(unknown.status).toBe(200)
    expect(unknown.body).toEqual(known.body)
    expect(sent).toHaveLength(0)
  })

  it('rejects an invalid email', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'bad' })
    expect(res.status).toBe(400)
  })

  it('stores only a hash of the token', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email })
    const token = tokenFromLastEmail()
    expect(await prisma.passwordResetToken.findFirst({ where: { tokenHash: token } })).toBeNull()
  })
})

describe('POST /api/auth/reset-password', () => {
  it('resets the password once, then the link stops working', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email })
    const token = tokenFromLastEmail()

    const ok = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: newPassword })
    expect(ok.status).toBe(200)

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: newPassword })
    expect(newLogin.status).toBe(200)
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: oldPassword })
    expect(oldLogin.status).toBe(401)

    const reuse = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'Another789' })
    expect(reuse.status).toBe(400)
  })

  it('only honours the most recent link', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email })
    const first = tokenFromLastEmail()
    await request(app).post('/api/auth/forgot-password').send({ email })
    const second = tokenFromLastEmail()

    const stale = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: first, password: 'Another789' })
    expect(stale.status).toBe(400)
    const fresh = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: second, password: 'Another789' })
    expect(fresh.status).toBe(200)
  })

  it('rejects an expired token', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email })
    const token = tokenFromLastEmail()
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'Another789' })
    expect(res.status).toBe(400)
  })

  it('rejects unknown tokens and weak passwords', async () => {
    const bad = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'nope', password: 'Another789' })
    expect(bad.status).toBe(400)
    await request(app).post('/api/auth/forgot-password').send({ email })
    const weak = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: tokenFromLastEmail(), password: 'weak' })
    expect(weak.status).toBe(400)
    expect(weak.body.error.details).toHaveProperty('password')
  })
})
