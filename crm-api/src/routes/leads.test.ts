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
  manager: `ld-manager-${stamp}@crm.local`,
  other: `ld-other-${stamp}@crm.local`,
  gone: `ld-gone-${stamp}@crm.local`,
  support: `ld-support-${stamp}@crm.local`,
}
const tokens = { sales: '', manager: '', other: '', gone: '', support: '' }
const ids = { sales: '', manager: '', other: '', gone: '', support: '' }
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
    ['manager', 'MANAGER'],
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
  await prisma.auditLog.deleteMany({ where: { action: 'LEAD_ASSIGNED', userId: ids.manager } })
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
    const res = await create('manager', {
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
      [{ title: title('v'), status: 'CONVERTED' }, 'status'],
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
      const res = await create('manager', { title: title('o'), ownerId })
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

  it('clears optional fields with null (or empty notes)', async () => {
    const id = await make()
    const res = await patch('sales', id, { source: null, value: null, notes: '' })
    expect(res.status).toBe(200)
    expect(res.body.lead).toMatchObject({
      source: null,
      value: null,
      notes: null,
      owner: { id: ids.sales },
    })
  })

  it('will not blank the title or give the lead to an inactive user', async () => {
    const id = await make()
    expect((await patch('sales', id, { title: ' ' })).status).toBe(400)
    expect((await patch('manager', id, { ownerId: ids.gone })).status).toBe(400)
    expect((await patch('sales', id, { value: -5 })).status).toBe(400)
  })
})

describe('pipeline stages', () => {
  const STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST']

  it('moves a lead through every stage, and the old stages are gone', async () => {
    const id = (await create('sales', { title: title('Walk') })).body.lead.id as string
    for (const stage of STAGES) {
      const res = await patch('sales', id, { status: stage })
      expect(res.status, stage).toBe(200)
      expect(res.body.lead.status).toBe(stage)
    }
    for (const old of ['UNQUALIFIED', 'CONVERTED']) {
      expect((await patch('sales', id, { status: old })).status).toBe(400)
    }
  })

  it('counts leads per stage under the search, whichever stage is chosen', async () => {
    const q = `Count${stamp}`
    await create('sales', { title: `${q} a`, status: 'NEGOTIATION' })
    await create('sales', { title: `${q} b`, status: 'NEGOTIATION' })
    await create('sales', { title: `${q} c`, status: 'LOST' })
    const res = await request(app).get('/api/leads').query({ q, status: 'LOST' }).set(as('sales'))
    expect(res.body.total).toBe(1)
    expect(Object.keys(res.body.stageCounts)).toEqual(STAGES)
    expect(res.body.stageCounts).toMatchObject({ NEGOTIATION: 2, LOST: 1, NEW: 0, WON: 0 })
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
      .query({ q: String(stamp), priority: 'LOW', status: 'WON' })
      .set(as('sales'))
    expect(none.body.total).toBe(0)

    expect((await request(app).get('/api/leads').query({ page: 0 }).set(as('sales'))).status).toBe(
      400,
    )

    const one = await request(app).get(`/api/leads/${a.id}`).set(as('sales'))
    expect(one.body.lead.id).toBe(a.id)
    expect((await request(app).get('/api/leads/missing').set(as('sales'))).status).toBe(404)
  })
})

describe('assigning leads', () => {
  const make = async (who: Who = 'sales') =>
    (await create(who, { title: title('Assign') })).body.lead.id as string
  const auditFor = (id: string) =>
    prisma.auditLog.findMany({ where: { action: 'LEAD_ASSIGNED', entityId: id } })

  it('lets a manager give a lead to anyone active, and take it back off them', async () => {
    const id = await make()
    const to = await patch('manager', id, { ownerId: ids.other })
    expect(to.status).toBe(200)
    expect(to.body.lead.owner).toMatchObject({ id: ids.other })

    const none = await patch('manager', id, { ownerId: null })
    expect(none.status).toBe(200)
    expect(none.body.lead.owner).toBeNull()

    const log = await auditFor(id)
    expect(log).toHaveLength(2)
    expect(log.map((l) => l.changes)).toEqual(
      expect.arrayContaining([
        { from: ids.sales, to: ids.other },
        { from: ids.other, to: null },
      ]),
    )
    expect(log.every((l) => l.userId === ids.manager)).toBe(true)
  })

  it('lets a manager create a lead for someone else', async () => {
    const res = await create('manager', { title: title('For other'), ownerId: ids.other })
    expect(res.status).toBe(201)
    expect(res.body.lead.owner.id).toBe(ids.other)
    const mine = await create('manager', { title: title('Mine') })
    expect(mine.body.lead.owner.id).toBe(ids.manager)
  })

  it('does not let sales give a lead away, take someone else’s, or pick another owner on create', async () => {
    const id = await make()
    const away = await patch('sales', id, { ownerId: ids.other })
    expect(away.status).toBe(403)
    expect(away.body.error.details).toHaveProperty('ownerId')
    expect((await patch('sales', id, { ownerId: null })).status).toBe(403)

    const theirs = await make('manager')
    expect((await patch('sales', theirs, { ownerId: ids.sales })).status).toBe(403)

    const create403 = await create('sales', { title: title('Gift'), ownerId: ids.other })
    expect(create403.status).toBe(403)
    expect(await prisma.lead.count({ where: { title: title('Gift') } })).toBe(0)

    const stillMine = await request(app).get(`/api/leads/${id}`).set(as('sales'))
    expect(stillMine.body.lead.owner.id).toBe(ids.sales)
    expect(await auditFor(id)).toHaveLength(0)
  })

  it('lets sales keep editing a lead that is not theirs, as long as the owner stays', async () => {
    const id = await make('manager')
    const res = await patch('sales', id, { priority: 'HIGH', ownerId: ids.manager })
    expect(res.status).toBe(200)
    expect(res.body.lead).toMatchObject({ priority: 'HIGH', owner: { id: ids.manager } })
    expect(await auditFor(id)).toHaveLength(0)
    // Naming themselves as owner of their own new lead is not an assignment either.
    expect((await create('sales', { title: title('Self'), ownerId: ids.sales })).status).toBe(201)
  })

  it('still lets a lead be edited after its owner was deactivated, but not given to them', async () => {
    const lead = await prisma.lead.create({
      data: { title: title('Orphan'), ownerId: ids.gone },
    })
    const edit = await patch('sales', lead.id, { priority: 'LOW', ownerId: ids.gone })
    expect(edit.status).toBe(200)
    expect(edit.body.lead.owner.id).toBe(ids.gone)
    // Moving it to someone else is fine, and so is handing it to the inactive user only if unchanged.
    expect((await patch('manager', lead.id, { ownerId: ids.other })).status).toBe(200)
    expect((await patch('manager', lead.id, { ownerId: ids.gone })).status).toBe(400)
  })

  it('does not log a reassignment to the same owner', async () => {
    const id = await make()
    expect((await patch('manager', id, { ownerId: ids.sales })).status).toBe(200)
    expect(await auditFor(id)).toHaveLength(0)
  })

  it('offers only active users as owners, and only to those who can assign', async () => {
    const res = await request(app).get('/api/leads/owners').set(as('manager'))
    expect(res.status).toBe(200)
    const owners = res.body.owners.map((o: { id: string }) => o.id)
    expect(owners).toEqual(expect.arrayContaining([ids.other, ids.sales, ids.manager]))
    expect(owners).not.toContain(ids.gone)
    for (const who of ['sales', 'support'] as const) {
      expect((await request(app).get('/api/leads/owners').set(as(who))).status).toBe(403)
    }
  })
})
