import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { ROLE_PERMISSIONS, syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const stamp = Date.now()
const emails = {
  admin: `rbac-admin-${stamp}@crm.local`,
  sales: `rbac-sales-${stamp}@crm.local`,
  support: `rbac-support-${stamp}@crm.local`,
}
const password = 'Secret123!'
const tokens: Record<keyof typeof emails, string> = { admin: '', sales: '', support: '' }
const ids: Record<keyof typeof emails, string> = { admin: '', sales: '', support: '' }

beforeAll(async () => {
  await syncPermissions(prisma)
  const roles = await prisma.role.findMany()
  const roleId = (n: string) => roles.find((r) => r.name === n)!.id
  const passwordHash = await bcrypt.hash(password, 4)

  const make = { admin: 'ADMIN', sales: 'SALES', support: 'SUPPORT' } as const
  for (const key of Object.keys(make) as (keyof typeof make)[]) {
    const u = await prisma.user.create({
      data: {
        email: emails[key],
        passwordHash,
        firstName: key,
        lastName: 'Rbac',
        roleId: roleId(make[key]),
      },
    })
    ids[key] = u.id
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }
})

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { userId: ids.admin } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.$disconnect()
})

const as = (who: keyof typeof tokens, r: request.Test) =>
  r.set('Authorization', `Bearer ${tokens[who]}`)

describe('permissions in responses', () => {
  it('login and /auth/me expose the role’s permissions', async () => {
    const res = await as('sales', request(app).get('/api/auth/me'))
    expect(res.body.user.role).toBe('SALES')
    expect(res.body.user.permissions).toEqual([...ROLE_PERMISSIONS.SALES].sort())
    expect(res.body.user.permissions).toContain('contacts:write')
    expect(res.body.user.permissions).not.toContain('users:manage')
  })
})

describe('GET /api/users (admin only)', () => {
  it('rejects anonymous callers with 401', async () => {
    expect((await request(app).get('/api/users')).status).toBe(401)
  })

  it('rejects non-admins with 403', async () => {
    expect((await as('sales', request(app).get('/api/users'))).status).toBe(403)
    expect((await as('support', request(app).get('/api/users'))).status).toBe(403)
  })

  it('lets admins list and search users, never exposing hashes', async () => {
    const res = await as(
      'admin',
      request(app)
        .get('/api/users')
        .query({ q: `rbac-sales-${stamp}` }),
    )
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.users[0]).toMatchObject({ email: emails.sales, role: 'SALES', isActive: true })
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/)
  })

  it('paginates', async () => {
    const res = await as('admin', request(app).get('/api/users').query({ pageSize: 1, page: 1 }))
    expect(res.body.users).toHaveLength(1)
    expect(res.body.total).toBeGreaterThanOrEqual(3)
  })
})

describe('GET /api/roles', () => {
  it('is admin only and lists each role with its permissions', async () => {
    expect((await as('sales', request(app).get('/api/roles'))).status).toBe(403)
    const res = await as('admin', request(app).get('/api/roles'))
    expect(res.status).toBe(200)
    expect(res.body.roles.map((r: { name: string }) => r.name)).toEqual([
      'ADMIN',
      'MANAGER',
      'SALES',
      'SUPPORT',
    ])
  })
})

describe('PATCH /api/users/:id/role', () => {
  const assign = (who: keyof typeof tokens, id: string, role: unknown) =>
    as(who, request(app).patch(`/api/users/${id}/role`)).send({ role })

  it('is forbidden for non-admins, who cannot promote themselves', async () => {
    expect((await assign('sales', ids.sales, 'ADMIN')).status).toBe(403)
    const me = await as('sales', request(app).get('/api/auth/me'))
    expect(me.body.user.role).toBe('SALES')
  })

  it('validates the role, the target and self-changes', async () => {
    expect((await assign('admin', ids.sales, 'SUPERUSER')).status).toBe(400)
    expect((await assign('admin', 'does-not-exist', 'SALES')).status).toBe(404)
    const self = await assign('admin', ids.admin, 'SUPPORT')
    expect(self.status).toBe(400)
    expect(self.body.error.message).toMatch(/own role/)
  })

  it('changes the role, takes effect immediately, and writes an audit log', async () => {
    // Support user can't manage users...
    expect((await as('support', request(app).get('/api/users'))).status).toBe(403)

    const res = await assign('admin', ids.support, 'MANAGER')
    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe('MANAGER')
    expect(res.body.user.permissions).toContain('reports:read')

    // ...and the SAME old token now reflects the new role's permissions.
    const me = await as('support', request(app).get('/api/auth/me'))
    expect(me.body.user.role).toBe('MANAGER')
    // Manager still cannot manage users.
    expect((await as('support', request(app).get('/api/users'))).status).toBe(403)

    const log = await prisma.auditLog.findFirst({
      where: { entityId: ids.support, action: 'ROLE_CHANGE' },
    })
    expect(log).toMatchObject({ userId: ids.admin, entityType: 'User' })
    expect(log?.changes).toEqual({ from: 'SUPPORT', to: 'MANAGER' })
  })

  it('grants admin powers immediately when promoted to ADMIN', async () => {
    expect((await as('sales', request(app).get('/api/users'))).status).toBe(403)
    await assign('admin', ids.sales, 'ADMIN')
    expect((await as('sales', request(app).get('/api/users'))).status).toBe(200)
  })
})

describe('deactivated users', () => {
  it('lose access even with an unexpired token', async () => {
    await prisma.user.update({ where: { id: ids.admin }, data: { isActive: false } })
    expect((await as('admin', request(app).get('/api/users'))).status).toBe(401)
    await prisma.user.update({ where: { id: ids.admin }, data: { isActive: true } })
  })
})
