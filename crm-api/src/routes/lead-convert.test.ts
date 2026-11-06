import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import type { LeadStatus } from '../generated/prisma/client.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = {
  sales: `cv-sales-${stamp}@crm.local`,
  manager: `cv-manager-${stamp}@crm.local`,
  support: `cv-support-${stamp}@crm.local`,
}
const tokens = { sales: '', manager: '', support: '' }
const ids = { sales: '', manager: '', support: '' }
const title = (n: string) => `${n} Cv ${stamp}`

let stageId = ''
let companyId = ''
let contactId = ''
const tagIds: string[] = []

type Who = keyof typeof tokens
const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` })
const convert = (who: Who, leadId: string, body: object = {}) =>
  request(app).post(`/api/leads/${leadId}/convert`).set(as(who)).send(body)

const newLead = async (
  label: string,
  extra: {
    status?: LeadStatus
    value?: number
    notes?: string
    ownerId?: string | null
    contactId?: string
    tags?: boolean
  } = {},
) =>
  (
    await prisma.lead.create({
      data: {
        title: title(label),
        status: extra.status ?? 'QUALIFIED',
        value: extra.value,
        notes: extra.notes,
        ownerId: extra.ownerId === undefined ? ids.manager : extra.ownerId,
        contactId: extra.contactId,
        tags: extra.tags ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
      },
    })
  ).id

beforeAll(async () => {
  await syncPermissions(prisma)
  const roles = await prisma.role.findMany()
  const passwordHash = await bcrypt.hash(password, 4)
  for (const [key, role] of [
    ['sales', 'SALES'],
    ['manager', 'MANAGER'],
    ['support', 'SUPPORT'],
  ] as const) {
    const u = await prisma.user.create({
      data: {
        email: emails[key],
        passwordHash,
        firstName: key,
        lastName: 'Cv',
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    ids[key] = u.id
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }
  const pipeline = await prisma.pipeline.create({
    data: {
      name: `cv-${stamp}`,
      stages: { create: [{ name: 'Pitch', position: 1, probability: 40 }] },
    },
    include: { stages: true },
  })
  stageId = pipeline.stages[0].id
  companyId = (await prisma.company.create({ data: { name: `Acme Cv ${stamp}` } })).id
  contactId = (await prisma.contact.create({ data: { firstName: 'Cy', lastName: `Cv${stamp}` } }))
    .id
  for (const name of ['hot', 'enterprise']) {
    tagIds.push((await prisma.tag.create({ data: { name: `${name}-cv-${stamp}` } })).id)
  }
})

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { action: 'LEAD_CONVERTED', userId: ids.sales } })
  await prisma.lead.deleteMany({ where: { title: { contains: String(stamp) } } })
  await prisma.deal.deleteMany({ where: { title: { contains: String(stamp) } } })
  await prisma.pipeline.deleteMany({ where: { name: `cv-${stamp}` } })
  await prisma.tag.deleteMany({ where: { id: { in: tagIds } } })
  await prisma.contact.deleteMany({ where: { lastName: `Cv${stamp}` } })
  await prisma.company.deleteMany({ where: { name: { contains: String(stamp) } } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.$disconnect()
})

describe('POST /api/leads/:id/convert', () => {
  it('needs login and permission to write both leads and deals', async () => {
    const id = await newLead('perm')
    expect((await request(app).post(`/api/leads/${id}/convert`).send({})).status).toBe(401)
    expect((await convert('support', id)).status).toBe(403)
    expect(await prisma.deal.count({ where: { title: title('perm') } })).toBe(0)
  })

  it('makes a deal from the lead without being told anything', async () => {
    const id = await newLead('Basic', {
      value: 12500.5,
      notes: 'Wants a demo next week',
      contactId,
      tags: true,
    })
    const res = await convert('sales', id)
    expect(res.status).toBe(201)

    expect(res.body.deal).toMatchObject({
      title: title('Basic'),
      amount: 12500.5,
      status: 'OPEN',
      contact: { id: contactId },
      // It stays with the person who was working the lead, not whoever pressed the button.
      owner: { id: ids.manager },
    })
    expect(res.body.deal.stage.id).toBeTruthy()
    expect(res.body.lead).toMatchObject({
      status: 'WON',
      deal: { id: res.body.deal.id, title: title('Basic') },
    })

    const notes = await prisma.note.findMany({ where: { dealId: res.body.deal.id } })
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ body: 'Wants a demo next week', authorId: ids.sales })
    const tags = await prisma.tagOnDeal.findMany({ where: { dealId: res.body.deal.id } })
    expect(tags.map((t) => t.tagId).sort()).toEqual([...tagIds].sort())

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'LEAD_CONVERTED', entityId: id },
    })
    expect(audit).toMatchObject({ userId: ids.sales, changes: { dealId: res.body.deal.id } })
  })

  it('gives the deal to the person converting it when the lead has no owner, and copes with a bare lead', async () => {
    const id = await newLead('Bare', { ownerId: null })
    const res = await convert('sales', id)
    expect(res.status).toBe(201)
    expect(res.body.deal).toMatchObject({ amount: 0, contact: null, company: null })
    expect(res.body.deal.owner.id).toBe(ids.sales)
    expect(await prisma.note.count({ where: { dealId: res.body.deal.id } })).toBe(0)
  })

  it('lets what is sent override what the lead says', async () => {
    const id = await newLead('Override', { value: 100 })
    const res = await convert('sales', id, {
      title: title('Renamed'),
      amount: 9000,
      stageId,
      probability: 55,
      expectedClose: '2027-06-30',
      companyId,
    })
    expect(res.status).toBe(201)
    expect(res.body.deal).toMatchObject({
      title: title('Renamed'),
      amount: 9000,
      probability: 55,
      stage: { id: stageId },
      company: { id: companyId },
    })
    expect(res.body.deal.expectedClose.slice(0, 10)).toBe('2027-06-30')
  })

  it('works from every qualified stage, and from no other', async () => {
    for (const status of ['QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION'] as const) {
      const id = await newLead(`ok-${status}`, { status })
      expect((await convert('sales', id)).status, status).toBe(201)
    }
    for (const status of ['NEW', 'CONTACTED', 'WON', 'LOST'] as const) {
      const id = await newLead(`no-${status}`, { status })
      const res = await convert('sales', id)
      expect(res.status, status).toBe(409)
      expect(res.body.error.message).toContain('qualified')
      expect(await prisma.deal.count({ where: { title: title(`no-${status}`) } })).toBe(0)
      expect((await prisma.lead.findUniqueOrThrow({ where: { id } })).status).toBe(status)
    }
  })

  it('cannot convert a lead twice', async () => {
    const id = await newLead('Twice')
    expect((await convert('sales', id)).status).toBe(201)
    const again = await convert('sales', id)
    expect(again.status).toBe(409)
    expect(again.body.error.message).toContain('already')
    expect(await prisma.deal.count({ where: { title: title('Twice') } })).toBe(1)
  })

  it('makes exactly one deal when two people convert at the same time', async () => {
    const id = await newLead('Race', { notes: 'once' })
    const results = await Promise.all([convert('sales', id), convert('manager', id)])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    expect(await prisma.deal.count({ where: { title: title('Race') } })).toBe(1)
    expect(
      await prisma.note.count({ where: { body: 'once', deal: { title: title('Race') } } }),
    ).toBe(1)
  })

  it('does nothing at all if the deal is not valid', async () => {
    const id = await newLead('Atomic', { notes: 'keep me', tags: true })
    for (const body of [
      { companyId: 'nope' },
      { stageId: 'nope' },
      { amount: -1 },
      { title: ' ' },
    ]) {
      const res = await convert('sales', id, body)
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id } })
    expect(lead).toMatchObject({ status: 'QUALIFIED', dealId: null })
    expect(await prisma.deal.count({ where: { title: title('Atomic') } })).toBe(0)
    // And it can still be converted afterwards.
    expect((await convert('sales', id)).status).toBe(201)
  })

  it('404s for a lead that does not exist', async () => {
    expect((await convert('sales', 'missing')).status).toBe(404)
  })

  it('leaves the lead’s files with the lead', async () => {
    const id = await newLead('Files')
    await prisma.leadAttachment.create({
      data: {
        leadId: id,
        name: 'quote.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        data: new Uint8Array([1]),
        uploadedById: ids.sales,
      },
    })
    expect((await convert('sales', id)).status).toBe(201)
    expect(await prisma.leadAttachment.count({ where: { leadId: id } })).toBe(1)
  })

  it('takes a converted lead out of the list unless it is asked for, counts and all', async () => {
    const q = `Gone${stamp}`
    const staying = await prisma.lead.create({
      data: { title: `${q} stays`, status: 'QUALIFIED', ownerId: ids.sales },
    })
    const leaving = await newLead(`${q} leaves`)
    expect((await convert('sales', leaving)).status).toBe(201)

    const list = (query: object) =>
      request(app)
        .get('/api/leads')
        .query({ q, ...query })
        .set(as('sales'))
    const normal = await list({})
    expect(normal.body.leads.map((l: { id: string }) => l.id)).toEqual([staying.id])
    expect(normal.body.total).toBe(1)
    // The stage counts leave it out too: its lead became a deal.
    expect(normal.body.stageCounts).toMatchObject({ QUALIFIED: 1, WON: 0 })

    const all = await list({ converted: 'true' })
    expect(all.body.leads.map((l: { id: string }) => l.id).sort()).toEqual(
      [staying.id, leaving].sort(),
    )
    expect(all.body.stageCounts).toMatchObject({ QUALIFIED: 1, WON: 1 })
    expect((await list({ converted: 'maybe' })).status).toBe(400)

    // It is still there to open.
    expect((await request(app).get(`/api/leads/${leaving}`).set(as('sales'))).status).toBe(200)
  })

  it('shows the deal on the lead afterwards, and lets go if the deal is deleted', async () => {
    const id = await newLead('Linked', { contactId })
    const res = await convert('sales', id)
    const lead = await request(app).get(`/api/leads/${id}`).set(as('sales'))
    expect(lead.body.lead).toMatchObject({
      deal: { id: res.body.deal.id },
      contact: { id: contactId },
    })
    const list = await request(app)
      .get('/api/leads')
      .query({ q: title('Linked'), converted: 'true' })
      .set(as('sales'))
    expect(list.body.leads[0].deal.id).toBe(res.body.deal.id)

    await prisma.deal.delete({ where: { id: res.body.deal.id } })
    expect((await prisma.lead.findUniqueOrThrow({ where: { id } })).dealId).toBeNull()
  })
})
