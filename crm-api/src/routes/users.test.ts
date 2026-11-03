import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { prisma } from '../lib/prisma.js'

const email = `profile-test-${Date.now()}@crm.local`
let token: string

beforeAll(async () => {
  const role = await prisma.role.upsert({
    where: { name: 'MANAGER' },
    update: {},
    create: { name: 'MANAGER' },
  })
  await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash('Secret123!', 4),
      firstName: 'Pro',
      lastName: 'File',
      roleId: role.id,
    },
  })
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Secret123!' })
  token = res.body.token
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } })
  await prisma.$disconnect()
})

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`)

describe('GET /api/users/me', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/users/me')).status).toBe(401)
  })

  it('returns my profile without secrets', async () => {
    const res = await auth(request(app).get('/api/users/me'))
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({
      email,
      firstName: 'Pro',
      role: 'MANAGER',
      avatarUrl: null,
    })
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/)
  })
})

describe('PATCH /api/users/me', () => {
  it('requires authentication', async () => {
    expect((await request(app).patch('/api/users/me').send({ firstName: 'X' })).status).toBe(401)
  })

  it('updates names and persists them', async () => {
    const res = await auth(request(app).patch('/api/users/me')).send({
      firstName: '  Grace ',
      lastName: 'Hopper',
    })
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ firstName: 'Grace', lastName: 'Hopper' })
    const again = await auth(request(app).get('/api/users/me'))
    expect(again.body.user.firstName).toBe('Grace')
  })

  it('sets and clears the avatar, changing only the fields sent', async () => {
    const set = await auth(request(app).patch('/api/users/me')).send({
      avatarUrl: 'https://example.com/a.png',
    })
    expect(set.body.user).toMatchObject({
      avatarUrl: 'https://example.com/a.png',
      firstName: 'Grace',
    })
    const cleared = await auth(request(app).patch('/api/users/me')).send({ avatarUrl: '' })
    expect(cleared.body.user.avatarUrl).toBeNull()
  })

  it('rejects invalid values with field errors', async () => {
    const res = await auth(request(app).patch('/api/users/me')).send({
      firstName: '',
      avatarUrl: 'javascript:alert(1)',
    })
    expect(res.status).toBe(400)
    expect(res.body.error.details).toHaveProperty('firstName')
    expect(res.body.error.details).toHaveProperty('avatarUrl')
  })

  it('refuses to change email, role or anything else', async () => {
    for (const body of [
      { email: 'x@y.com' },
      { roleId: 'x' },
      { role: 'ADMIN' },
      { isActive: false },
    ]) {
      const res = await auth(request(app).patch('/api/users/me')).send(body)
      expect(res.status).toBe(400)
    }
    const me = await auth(request(app).get('/api/users/me'))
    expect(me.body.user).toMatchObject({ email, role: 'MANAGER' })
  })
})
