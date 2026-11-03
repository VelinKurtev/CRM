import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { prisma } from '../lib/prisma.js'

const email = `register-test-${Date.now()}@crm.local`
const valid = { firstName: 'Ann', lastName: 'Lee', email, password: 'Secret123' }

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } })
  await prisma.$disconnect()
})

describe('POST /api/auth/register', () => {
  it('creates an account with the default role and returns a session', async () => {
    const res = await request(app).post('/api/auth/register').send(valid)
    expect(res.status).toBe(201)
    expect(res.body.token).toEqual(expect.any(String))
    expect(res.body.user).toMatchObject({ email, firstName: 'Ann', role: 'SUPPORT' })
    expect(JSON.stringify(res.body)).not.toContain('Secret123')

    const stored = await prisma.user.findUniqueOrThrow({ where: { email } })
    expect(stored.passwordHash).not.toBe(valid.password)

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password: valid.password })
    expect(login.status).toBe(200)
  })

  it('rejects a duplicate email, ignoring case', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...valid, email: email.toUpperCase() })
    expect(res.status).toBe(409)
    expect(res.body.error.details).toHaveProperty('email')
  })

  it('validates input with field errors', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ firstName: '', lastName: '', email: 'bad', password: 'short' })
    expect(res.status).toBe(400)
    expect(Object.keys(res.body.error.details)).toEqual(
      expect.arrayContaining(['firstName', 'lastName', 'email', 'password']),
    )
  })

  it('does not let a client choose its own role', async () => {
    const other = `register-role-${Date.now()}@crm.local`
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...valid, email: other, role: 'ADMIN', roleId: 'x' })
    expect(res.status).toBe(201)
    expect(res.body.user.role).toBe('SUPPORT')
    await prisma.user.deleteMany({ where: { email: other } })
  })
})
