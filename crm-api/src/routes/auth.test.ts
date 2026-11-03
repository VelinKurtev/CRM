import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { prisma } from '../lib/prisma.js'

const email = `login-test-${Date.now()}@crm.local`
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
      firstName: 'Test',
      lastName: 'User',
      roleId: role.id,
    },
  })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } })
  await prisma.$disconnect()
})

describe('POST /api/auth/login', () => {
  it('returns a JWT and the user for valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password })
    expect(res.status).toBe(200)
    expect(res.body.token).toEqual(expect.any(String))
    expect(res.body.user).toMatchObject({ email, role: 'SALES' })
    expect(res.body.user.passwordHash).toBeUndefined()
  })

  it('is case-insensitive on email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: email.toUpperCase(), password })
    expect(res.status).toBe(200)
  })

  it('rejects a wrong password and an unknown email with the same message', async () => {
    const wrong = await request(app).post('/api/auth/login').send({ email, password: 'nope' })
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@crm.local', password })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body.error.message).toBe(unknown.body.error.message)
  })

  it('returns 400 with field errors for invalid input', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'bad', password: '' })
    expect(res.status).toBe(400)
    expect(res.body.error.details).toHaveProperty('email')
    expect(res.body.error.details).toHaveProperty('password')
  })
})

describe('GET /api/auth/me', () => {
  it('requires a valid token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401)
    const bad = await request(app).get('/api/auth/me').set('Authorization', 'Bearer junk')
    expect(bad.status).toBe(401)
  })

  it('returns the current user for a valid token', async () => {
    const login = await request(app).post('/api/auth/login').send({ email, password })
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe(email)
  })
})
