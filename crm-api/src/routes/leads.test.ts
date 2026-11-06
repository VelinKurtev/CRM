import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = {
  sales: `ld-sales-${stamp}@crm.local`,
  other: `ld-other-${stamp}@crm.local`,
  gone: `ld-gone-${stamp}@crm.local`,
  support: `ld-support-${stamp}@crm.local`,
}
const tokens = { sales: '', other: '', gone: '', support: '' }
const ids = { sales: '', other: '', gone: '', support: '' }
const title = (n: string) => `${n} Lead ${stamp}`

type Who = keyof typeof tokens
const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` })
const create = (who: Who, body: object) => request(app).post('/api/leads').set(as(who)).send(body)
const patch = (who: Who, id: string, body: object) =>
  request(app).patch(`/api/leads/${id}`).set(as(who)).send(body)

beforeAll(async () => {
  await syncPermissions(prisma)
  const roles = await prisma.role.findMany()
  const passwordHash = await bcrypt.hash(password, 4)
  for (const [key, role] of [
    ['sales', 'SALES'],
    ['other', 'SALES'],
    ['gone', 'SALES'],
    ['support', 'SUPPORT'],
  ] as const) {
    const u = await prisma.user.create({
      data: {
        email: emails[key],
        passwordHash,
        firstName: key,
        lastName: 'Ld',
        isActive: key !== 'gone',
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    ids[key] = u.id
    if (key === 'gone') continue
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }
})

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { title: { contains: String(stamp) } } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.$disconnect()
})

describe('POST /api/leads', () => {
  it('needs login and leads:write', async () => {
    expect((await request(app).post('/api/leads').send({ title: 'x' })).status).toBe(401)
    expect((await create('support', { title: title('a') })).status).toBe(403)
  })

  it('creates a lead with every field', async () => {
    const res = await create('sales', {
      title: title('Full'),
      source: 'Trade show',
      value: 12500.5,
      priority: 'HIGH',
      status: 'CONTACTED',
      notes: '  Wants a demo  ',
      ownerId: ids.other,
    })
    expect(res.status).toBe(201)
    expect(res.body.lead).toMatchObject({
      title: title('Full'),
      source: 'Trade show',
      value: 12500.5,
      priority: 'HIGH',
      status: 'CONTACTED',
      notes: 'Wants a demo',
      owner: { id: ids.other, firstName: 'other', lastName: 'Ld' },
    })
  })

  it('needs only a title: NEW, medium priority, owned by the creator', async () => {
    const res = await create('sales', { title: title('Min') })
    expect(res.status).toBe(201)
    expect(res.body.lead).toMatchObject({
      status: 'NEW',
      priority: 'MEDIUM',
      value: null,
      source: null,
      notes: null,
      owner: { id: ids.sales },
    })
  })

  it('rejects bad input with field errors', async () => {
    const cases: [object, string][] = [
      [{ title: '  ' }, 'title'],
      [{ title: title('v'), value: -1 }, 'value'],
      [{ title: title('v'), value: 1.234 }, 'value'],
      [{ title: title('v'), value: '5' }, 'value'],
      [{ title: title('v'), priority: 'URGENT' }, 'priority'],
      [{ title: title('v'), status: 'WON' }, 'status'],
      [{ title: title('v'), notes: 'x'.repeat(5001) }, 'notes'],
    ]
    for (const [body, field] of cases) {
      const res = await create('sales', body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect(res.body.error.details, JSON.stringify(body)).toHaveProperty(field)
    }
  })

  it('rejects an owner who is missing or inactive', async () => {
    for (const ownerId of ['nobody', ids.gone]) {
      const res = await create('sales', { title: title('o'), ownerId })
      expect(res.status).toBe(400)
      expect(res.body.error.details).toHaveProperty('ownerId')
    }
  })
})

describe('PATCH /api/leads/:id', () => {
  const make = async () =>
    (
      await create('sales', {
        title: title('Edit'),
        source: 'Web',
        value: 100,
        notes: 'first',
      })
    ).body.lead.id as string

  it('needs leads:write and an existing lead', async () => {
    const id = await make()
    expect((await patch('support', id, { title: 'x' })).status).toBe(403)
    expect((await patch('sales', 'missing', { title: 'x' })).status).toBe(404)
  })

  it('changes only what is sent', async () => {
    const id = await make()
    const res = await patch('sales', id, { priority: 'LOW', status: 'QUALIFIED' })
    expect(res.status).toBe(200)
    expect(res.body.lead).toMatchObject({
      title: title('Edit'),
      source: 'Web',
      value: 100,
      notes: 'first',
      priority: 'LOW',
      status: 'QUALIFIED',
    })
  })

  it('clears optional fields with null (or empty notes) and reassigns the owner', async () => {
    const id = await make()
    const res = await patch('sales', id, {
      source: null,
      value: null,
      notes: '',
      ownerId: ids.other,
    })
    expect(res.status).toBe(200)
    expect(res.body.lead).toMatchObject({
      source: null,
      value: null,
      notes: null,
      owner: { id: ids.other },
    })
  })

  it('will not blank the title or give the lead to an inactive user', async () => {
    const id = await make()
    expect((await patch('sales', id, { title: ' ' })).status).toBe(400)
    expect((await patch('sales', id, { ownerId: ids.gone })).status).toBe(400)
    expect((await patch('sales', id, { value: -5 })).status).toBe(400)
  })
})

describe('GET /api/leads', () => {
  it('lists, searches and filters, newest first, and reads one lead', async () => {
    const a = (await create('sales', { title: title('Zed'), source: 'Referral', priority: 'HIGH' }))
      .body.lead
    await create('sales', { title: title('Amy'), priority: 'LOW' })

    const all = await request(app)
      .get('/api/leads')
      .query({ q: String(stamp) })
      .set(as('support'))
    // Support has no leads permissions at all.
    expect(all.status).toBe(403)

    const list = await request(app)
      .get('/api/leads')
      .query({ q: String(stamp), pageSize: 100 })
      .set(as('sales'))
    expect(list.status).toBe(200)
    expect(list.body.total).toBeGreaterThanOrEqual(2)
    const stamps = list.body.leads.map((l: { createdAt: string }) => l.createdAt)
    expect([...stamps].sort().reverse()).toEqual(stamps)

    const bySource = await request(app)
      .get('/api/leads')
      .query({ q: 'referral', priority: 'HIGH' })
      .set(as('sales'))
    expect(bySource.body.leads.map((l: { id: string }) => l.id)).toContain(a.id)
    const none = await request(app)
      .get('/api/leads')
      .query({ q: String(stamp), priority: 'LOW', status: 'CONVERTED' })
      .set(as('sales'))
    expect(none.body.total).toBe(0)

    expect((await request(app).get('/api/leads').query({ page: 0 }).set(as('sales'))).status).toBe(
      400,
    )

    const one = await request(app).get(`/api/leads/${a.id}`).set(as('sales'))
    expect(one.body.lead.id).toBe(a.id)
    expect((await request(app).get('/api/leads/missing').set(as('sales'))).status).toBe(404)
  })

  it('offers only active users as owners, to those who can write leads', async () => {
    const res = await request(app).get('/api/leads/owners').set(as('sales'))
    expect(res.status).toBe(200)
    const owners = res.body.owners.map((o: { id: string }) => o.id)
    expect(owners).toContain(ids.other)
    expect(owners).not.toContain(ids.gone)
    expect((await request(app).get('/api/leads/owners').set(as('support'))).status).toBe(403)
  })
})
