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

describe('POST /api/users/me/password', () => {
  const change = (body: object, tok = token) =>
    request(app).post('/api/users/me/password').set('Authorization', `Bearer ${tok}`).send(body)
  const loginWith = (password: string) =>
    request(app).post('/api/auth/login').send({ email, password })

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/users/me/password')
      .send({ currentPassword: 'x', newPassword: 'NewPass123' })
    expect(res.status).toBe(401)
  })

  it('rejects a wrong current password and leaves the password unchanged', async () => {
    const res = await change({ currentPassword: 'wrong', newPassword: 'NewPass123' })
    expect(res.status).toBe(400)
    expect(res.body.error.details).toHaveProperty('currentPassword')
    expect((await loginWith('Secret123!')).status).toBe(200)
  })

  it('rejects weak or unchanged passwords', async () => {
    const weak = await change({ currentPassword: 'Secret123!', newPassword: 'weak' })
    expect(weak.status).toBe(400)
    expect(weak.body.error.details).toHaveProperty('newPassword')
    const same = await change({ currentPassword: 'Secret123!', newPassword: 'Secret123!' })
    expect(same.status).toBe(400)
    expect(same.body.error.details).toHaveProperty('newPassword')
  })

  it('changes the password, signs out other devices and keeps this one signed in', async () => {
    const other = await loginWith('Secret123!')
    const otherCookie = (other.headers['set-cookie'] as unknown as string[])[0].split(';')[0]

    const res = await change({ currentPassword: 'Secret123!', newPassword: 'Changed456' })
    expect(res.status).toBe(200)
    expect(res.body.token).toEqual(expect.any(String))
    expect(JSON.stringify(res.body)).not.toMatch(/Changed456|passwordHash/)

    expect((await loginWith('Secret123!')).status).toBe(401)
    expect((await loginWith('Changed456')).status).toBe(200)

    // The other device's refresh token no longer works...
    const stale = await request(app).post('/api/auth/refresh').set('Cookie', otherCookie)
    expect(stale.status).toBe(401)
    // ...but this device's new one does.
    const mine = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0]
    const ok = await request(app).post('/api/auth/refresh').set('Cookie', mine)
    expect(ok.status).toBe(200)
  })
})
