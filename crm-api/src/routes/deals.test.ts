import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = { sales: `dl-sales-${stamp}@crm.local`, support: `dl-support-${stamp}@crm.local` }
const tokens = { sales: '', support: '' }
let salesId = ''
const title = (n: string) => `${n} Deal ${stamp}`

/** A pipeline of our own so the tests do not depend on what else is in the database. */
let pipelineId = ''
let otherPipelineStage = ''
const stage = { lead: '', pitch: '', won: '', lost: '' }
let companyId = ''
let contactId = ''

type Who = keyof typeof tokens
const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` })
const create = (who: Who, body: object) => request(app).post('/api/deals').set(as(who)).send(body)
const patch = (who: Who, id: string, body: object) =>
  request(app).patch(`/api/deals/${id}`).set(as(who)).send(body)
const make = async (body: object = {}) =>
  (await create('sales', { title: title('Make'), stageId: stage.lead, ...body })).body.deal as {
    id: string
  }

beforeAll(async () => {
  await syncPermissions(prisma)
  const roles = await prisma.role.findMany()
  const passwordHash = await bcrypt.hash(password, 4)
  for (const [key, role] of [
    ['sales', 'SALES'],
    ['support', 'SUPPORT'],
  ] as const) {
    const u = await prisma.user.create({
      data: {
        email: emails[key],
        passwordHash,
        firstName: key,
        lastName: 'Dl',
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    if (key === 'sales') salesId = u.id
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }

  const pipeline = await prisma.pipeline.create({
    data: {
      name: `dl-${stamp}`,
      stages: {
        create: [
          { name: 'Lead in', position: 1, probability: 10 },
          { name: 'Pitch', position: 2, probability: 60 },
          { name: 'Closed won', position: 3, probability: 100, isWon: true },
          { name: 'Closed lost', position: 4, probability: 0, isLost: true },
        ],
      },
    },
    include: { stages: { orderBy: { position: 'asc' } } },
  })
  pipelineId = pipeline.id
  ;[stage.lead, stage.pitch, stage.won, stage.lost] = pipeline.stages.map((s) => s.id)
  const other = await prisma.pipeline.create({
    data: { name: `dl-other-${stamp}`, stages: { create: [{ name: 'Elsewhere', position: 1 }] } },
    include: { stages: true },
  })
  otherPipelineStage = other.stages[0].id

  companyId = (await prisma.company.create({ data: { name: `Acme Dl ${stamp}` } })).id
  contactId = (await prisma.contact.create({ data: { firstName: 'Cy', lastName: `Dl${stamp}` } }))
    .id
})

afterAll(async () => {
  await prisma.deal.deleteMany({ where: { title: { contains: String(stamp) } } })
  await prisma.pipeline.deleteMany({
    where: { name: { in: [`dl-${stamp}`, `dl-other-${stamp}`] } },
  })
  await prisma.contact.deleteMany({ where: { lastName: `Dl${stamp}` } })
  await prisma.company.deleteMany({ where: { name: { contains: String(stamp) } } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.$disconnect()
})

describe('POST /api/deals', () => {
  it('needs login and deals:write', async () => {
    expect((await request(app).post('/api/deals').send({ title: 'x' })).status).toBe(401)
    expect((await create('support', { title: title('a') })).status).toBe(403)
  })

  it('creates a deal with every field', async () => {
    const res = await create('sales', {
      title: title('Full'),
      amount: 12500.5,
      stageId: stage.pitch,
      probability: 75,
      expectedClose: '2027-03-31',
      companyId,
      contactId,
    })
    expect(res.status).toBe(201)
    expect(res.body.deal).toMatchObject({
      title: title('Full'),
      amount: 12500.5,
      currency: 'USD',
      status: 'OPEN',
      probability: 75,
      closedAt: null,
      pipelineId,
      stage: { id: stage.pitch, name: 'Pitch' },
      company: { id: companyId, name: `Acme Dl ${stamp}` },
      contact: { id: contactId, firstName: 'Cy' },
      owner: { id: salesId },
    })
    expect(res.body.deal.expectedClose.slice(0, 10)).toBe('2027-03-31')
  })

  it('needs only a name: open, in the first stage, with that stage’s probability', async () => {
    const res = await create('sales', { title: title('Min'), stageId: stage.lead })
    expect(res.status).toBe(201)
    expect(res.body.deal).toMatchObject({
      amount: 0,
      status: 'OPEN',
      probability: 10,
      expectedClose: null,
      company: null,
      contact: null,
      owner: { id: salesId },
    })
  })

  it('takes the stage’s probability when none is given, and starts in the default pipeline without a stage', async () => {
    const pitch = await create('sales', { title: title('P'), stageId: stage.pitch })
    expect(pitch.body.deal.probability).toBe(60)
    const none = await create('sales', { title: title('NoStage') })
    expect(none.status).toBe(201)
    expect(none.body.deal.status).toBe('OPEN')
    expect(none.body.deal.stage.id).toBeTruthy()
  })

  it('closes the deal at once when created in a won or lost stage', async () => {
    const won = await create('sales', { title: title('W'), stageId: stage.won, probability: 20 })
    expect(won.body.deal).toMatchObject({ status: 'WON', probability: 100 })
    expect(won.body.deal.closedAt).not.toBeNull()
    const lost = await create('sales', { title: title('L'), stageId: stage.lost, probability: 50 })
    expect(lost.body.deal).toMatchObject({ status: 'LOST', probability: 0 })
    expect(lost.body.deal.closedAt).not.toBeNull()
  })

  it('rejects bad input with field errors', async () => {
    const ok = { title: title('Bad'), stageId: stage.lead }
    const cases: [object, string][] = [
      [{ ...ok, title: '  ' }, 'title'],
      [{ ...ok, amount: -1 }, 'amount'],
      [{ ...ok, amount: 1.234 }, 'amount'],
      [{ ...ok, amount: '5' }, 'amount'],
      [{ ...ok, probability: 101 }, 'probability'],
      [{ ...ok, probability: -1 }, 'probability'],
      [{ ...ok, probability: 12.5 }, 'probability'],
      [{ ...ok, expectedClose: '31/03/2027' }, 'expectedClose'],
      [{ ...ok, expectedClose: '2027-02-30' }, 'expectedClose'],
      [{ ...ok, stageId: 'nope' }, 'stageId'],
      [{ ...ok, companyId: 'nope' }, 'companyId'],
      [{ ...ok, contactId: 'nope' }, 'contactId'],
    ]
    for (const [body, field] of cases) {
      const res = await create('sales', body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect(res.body.error.details, JSON.stringify(body)).toHaveProperty(field)
    }
    expect(await prisma.deal.count({ where: { title: title('Bad') } })).toBe(0)
  })
})

describe('PATCH /api/deals/:id', () => {
  it('needs deals:write and an existing deal', async () => {
    const { id } = await make()
    expect((await patch('support', id, { title: 'x' })).status).toBe(403)
    expect((await patch('sales', 'missing', { title: 'x' })).status).toBe(404)
  })

  it('changes only what is sent', async () => {
    const { id } = await make({ amount: 100, expectedClose: '2027-01-15', companyId })
    const res = await patch('sales', id, { title: title('Renamed'), amount: 250.25 })
    expect(res.status).toBe(200)
    expect(res.body.deal).toMatchObject({
      title: title('Renamed'),
      amount: 250.25,
      probability: 10,
      company: { id: companyId },
      stage: { id: stage.lead },
    })
    expect(res.body.deal.expectedClose.slice(0, 10)).toBe('2027-01-15')
  })

  it('clears the closing date, company and contact with null', async () => {
    const { id } = await make({ expectedClose: '2027-01-15', companyId, contactId })
    const res = await patch('sales', id, { expectedClose: null, companyId: null, contactId: null })
    expect(res.status).toBe(200)
    expect(res.body.deal).toMatchObject({ expectedClose: null, company: null, contact: null })
  })

  it('takes the new stage’s probability when moved, unless one is given', async () => {
    const { id } = await make()
    const moved = await patch('sales', id, { stageId: stage.pitch })
    expect(moved.body.deal).toMatchObject({ stage: { id: stage.pitch }, probability: 60 })
    const own = await patch('sales', id, { stageId: stage.lead, probability: 33 })
    expect(own.body.deal).toMatchObject({ stage: { id: stage.lead }, probability: 33 })
    const edited = await patch('sales', id, { probability: 45 })
    expect(edited.body.deal).toMatchObject({ stage: { id: stage.lead }, probability: 45 })
  })

  it('closes the deal in a won or lost stage, and reopens it when moved back', async () => {
    const { id } = await make()
    const won = await patch('sales', id, { stageId: stage.won })
    expect(won.body.deal).toMatchObject({ status: 'WON', probability: 100 })
    const closedAt = won.body.deal.closedAt as string
    expect(closedAt).not.toBeNull()

    // Editing something else leaves the closing time alone, and the probability stays fixed.
    const same = await patch('sales', id, {
      title: title('Same'),
      probability: 5,
      stageId: stage.won,
    })
    expect(same.body.deal).toMatchObject({ status: 'WON', probability: 100, closedAt })

    const lost = await patch('sales', id, { stageId: stage.lost })
    expect(lost.body.deal).toMatchObject({ status: 'LOST', probability: 0 })
    expect(new Date(lost.body.deal.closedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(closedAt).getTime(),
    )

    const reopened = await patch('sales', id, { stageId: stage.pitch })
    expect(reopened.body.deal).toMatchObject({ status: 'OPEN', closedAt: null, probability: 60 })
  })

  it('only allows stages of the deal’s own pipeline', async () => {
    const { id } = await make()
    for (const stageId of [otherPipelineStage, 'missing']) {
      const res = await patch('sales', id, { stageId })
      expect(res.status).toBe(400)
      expect(res.body.error.details).toHaveProperty('stageId')
    }
    const still = await request(app).get(`/api/deals/${id}`).set(as('sales'))
    expect(still.body.deal.stage.id).toBe(stage.lead)
  })

  it('rejects bad input and missing customers', async () => {
    const { id } = await make()
    for (const body of [
      { title: ' ' },
      { amount: -5 },
      { probability: 150 },
      { expectedClose: 'soon' },
      { companyId: 'nope' },
      { contactId: 'nope' },
    ]) {
      expect((await patch('sales', id, body)).status, JSON.stringify(body)).toBe(400)
    }
  })
})

describe('reading deals', () => {
  it('reads one deal, and 404s for a missing one', async () => {
    const { id } = await make({ companyId })
    const res = await request(app).get(`/api/deals/${id}`).set(as('support'))
    expect(res.status).toBe(200)
    expect(res.body.deal).toMatchObject({ id, company: { id: companyId } })
    expect((await request(app).get('/api/deals/missing').set(as('sales'))).status).toBe(404)
    expect((await request(app).get(`/api/deals/${id}`)).status).toBe(401)
  })

  it('lists newest first, searches by name or company, and filters by status', async () => {
    const q = `Find${stamp}`
    const a = await make({ title: `${q} alpha`, stageId: stage.won })
    const b = await make({ title: `${q} beta`, companyId })
    const list = await request(app).get('/api/deals').query({ q, pageSize: 100 }).set(as('support'))
    expect(list.status).toBe(200)
    expect(list.body.deals.map((d: { id: string }) => d.id)).toEqual([b.id, a.id])
    expect(list.body.total).toBe(2)

    const won = await request(app).get('/api/deals').query({ q, status: 'WON' }).set(as('sales'))
    expect(won.body.deals.map((d: { id: string }) => d.id)).toEqual([a.id])

    const byCompany = await request(app)
      .get('/api/deals')
      .query({ q: `Acme Dl ${stamp}` })
      .set(as('sales'))
    expect(byCompany.body.deals.map((d: { id: string }) => d.id)).toContain(b.id)

    expect(
      (await request(app).get('/api/deals').query({ status: 'X' }).set(as('sales'))).status,
    ).toBe(400)
    expect((await request(app).get('/api/deals').query({ page: 0 }).set(as('sales'))).status).toBe(
      400,
    )
  })

  it('lists pipelines with their stages in order, the default one first', async () => {
    const res = await request(app).get('/api/pipelines').set(as('sales'))
    expect(res.status).toBe(200)
    const ours = res.body.pipelines.find((p: { id: string }) => p.id === pipelineId)
    expect(ours.stages.map((s: { name: string }) => s.name)).toEqual([
      'Lead in',
      'Pitch',
      'Closed won',
      'Closed lost',
    ])
    expect(ours.stages[2]).toMatchObject({ isWon: true, probability: 100 })
    expect(res.body.pipelines.length).toBeGreaterThanOrEqual(1)
    const defaults = res.body.pipelines.map((p: { isDefault: boolean }) => p.isDefault)
    expect(defaults).toEqual([...defaults].sort((x, y) => Number(y) - Number(x)))
    expect((await request(app).get('/api/pipelines')).status).toBe(401)
  })
})
