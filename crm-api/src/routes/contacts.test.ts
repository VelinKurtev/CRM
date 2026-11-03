import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = {
  sales: `ct-sales-${stamp}@crm.local`,
  support: `ct-support-${stamp}@crm.local`,
  manager: `ct-manager-${stamp}@crm.local`,
  other: `ct-other-${stamp}@crm.local`, // a second salesperson
}
const tokens = { sales: '', support: '', manager: '', other: '' }
let salesId = ''
const last = `ct-${stamp}`
const companyName = `Acme ${stamp}`
const tagA = `vip-${stamp}`
const tagB = `lead-${stamp}`

const post = (who: keyof typeof tokens, body: object) =>
  request(app).post('/api/contacts').set('Authorization', `Bearer ${tokens[who]}`).send(body)
const send = (who: keyof typeof tokens, method: 'patch' | 'delete', id: string, body?: object) =>
  request(app)
    [method](`/api/contacts/${id}`)
    .set('Authorization', `Bearer ${tokens[who]}`)
    .send(body)
const get = (who: keyof typeof tokens, path: string) =>
  request(app).get(path).set('Authorization', `Bearer ${tokens[who]}`)

beforeAll(async () => {
  await syncPermissions(prisma)
  const roles = await prisma.role.findMany()
  const passwordHash = await bcrypt.hash(password, 4)
  for (const [key, role] of [
    ['sales', 'SALES'],
    ['support', 'SUPPORT'],
    ['manager', 'MANAGER'],
    ['other', 'SALES'],
  ] as const) {
    const u = await prisma.user.create({
      data: {
        email: emails[key],
        passwordHash,
        firstName: key,
        lastName: 'Ct',
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    if (key === 'sales') salesId = u.id
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }
})

afterAll(async () => {
  await prisma.deal.deleteMany({ where: { title: `ct-${stamp}-deal` } })
  await prisma.pipeline.deleteMany({ where: { name: `ct-${stamp}` } })
  await prisma.auditLog.deleteMany({
    where: {
      action: 'DELETE',
      entityType: 'Contact',
      changes: { path: ['name'], string_contains: last },
    },
  })
  await prisma.contact.deleteMany({ where: { lastName: last } }) // cascades notes and tag links
  await prisma.company.deleteMany({ where: { name: { contains: String(stamp) } } })
  await prisma.tag.deleteMany({ where: { name: { contains: String(stamp) } } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.$disconnect()
})

describe('POST /api/contacts', () => {
  it('requires login and contacts:write', async () => {
    expect((await request(app).post('/api/contacts').send({})).status).toBe(401)
    expect((await post('support', { firstName: 'a', lastName: 'b' })).status).toBe(403)
  })

  it('creates a contact with only a name', async () => {
    const res = await post('sales', { firstName: ' Ann ', lastName: last })
    expect(res.status).toBe(201)
    expect(res.body.contact).toMatchObject({
      firstName: 'Ann',
      ownerId: salesId,
      company: null,
      tags: [],
      notes: [],
    })
  })

  it('stores every field: company, address, social links, tags and a first note', async () => {
    const res = await post('sales', {
      firstName: 'Bob',
      lastName: last,
      email: ' Bob@Example.COM ',
      phone: '+359 888 123 456',
      jobTitle: 'CTO',
      company: companyName,
      address: '1 Main St',
      city: 'Sofia',
      postalCode: '1000',
      country: 'Bulgaria',
      linkedinUrl: 'https://linkedin.com/in/bob',
      twitterUrl: 'https://x.com/bob',
      facebookUrl: 'https://facebook.com/bob',
      tags: [tagA, tagB],
      note: 'Met at the conference',
    })
    expect(res.status).toBe(201)
    const c = res.body.contact
    expect(c).toMatchObject({
      email: 'bob@example.com',
      jobTitle: 'CTO',
      city: 'Sofia',
      country: 'Bulgaria',
      linkedinUrl: 'https://linkedin.com/in/bob',
      company: { name: companyName },
    })
    expect([...c.tags].sort()).toEqual([tagA, tagB].sort())
    expect(c.notes).toHaveLength(1)

    const note = await prisma.note.findFirstOrThrow({ where: { contactId: c.id } })
    expect(note).toMatchObject({ body: 'Met at the conference', authorId: salesId })
  })

  it('links an existing company (any letter case) and reuses tags instead of duplicating', async () => {
    const res = await post('sales', {
      firstName: 'Cy',
      lastName: last,
      company: companyName.toUpperCase(),
      tags: [tagA.toUpperCase(), tagA, 'x-' + stamp],
    })
    expect(res.status).toBe(201)
    expect(
      await prisma.company.count({
        where: { name: { contains: String(stamp), mode: 'insensitive' } },
      }),
    ).toBe(1)
    expect(res.body.contact.tags.sort()).toEqual([tagA, 'x-' + stamp].sort())
    expect(await prisma.tag.count({ where: { name: { equals: tagA, mode: 'insensitive' } } })).toBe(
      1,
    )
  })

  it('rejects bad input with a message per field', async () => {
    const res = await post('sales', {
      firstName: '',
      lastName: last,
      email: 'nope',
      linkedinUrl: 'ftp://x',
      tags: Array.from({ length: 21 }, (_, i) => `t${i}`),
    })
    expect(res.status).toBe(400)
    expect(res.body.error.details).toMatchObject({
      firstName: 'First name is required',
      email: 'Enter a valid email',
    })
    expect(Object.keys(res.body.error.details)).toEqual(
      expect.arrayContaining(['linkedinUrl', 'tags']),
    )
  })

  it('does not let a client choose the owner or id', async () => {
    const res = await post('sales', {
      firstName: 'Di',
      lastName: last,
      ownerId: 'someone-else',
      id: 'x',
    })
    expect(res.status).toBe(201)
    expect(res.body.contact.ownerId).toBe(salesId)
    expect(res.body.contact.id).not.toBe('x')
  })
})

describe('suggestions', () => {
  it('searches companies and tags by part of the name', async () => {
    const companies = await get('sales', `/api/companies?q=${encodeURIComponent(`acme ${stamp}`)}`)
    expect(companies.body.companies.map((c: { name: string }) => c.name)).toEqual([companyName])
    const tags = await get('sales', `/api/tags?q=VIP-${stamp}`)
    expect(tags.body.tags).toEqual([tagA])
  })

  it('require login and read permission', async () => {
    expect((await request(app).get('/api/companies')).status).toBe(401)
    expect((await request(app).get('/api/tags')).status).toBe(401)
    // Support may read companies and contacts, so it gets suggestions too.
    expect((await get('support', '/api/companies')).status).toBe(200)
    expect((await get('support', '/api/tags')).status).toBe(200)
  })
})

const make = async (who: keyof typeof tokens = 'sales', extra: object = {}) =>
  (await post(who, { firstName: 'Zed', lastName: last, ...extra })).body.contact as {
    id: string
    [k: string]: unknown
  }

describe('GET /api/contacts/:id', () => {
  it('requires login and a real id', async () => {
    const c = await make()
    expect((await request(app).get(`/api/contacts/${c.id}`)).status).toBe(401)
    expect((await get('sales', '/api/contacts/nope')).status).toBe(404)
  })

  it('returns the contact with related counts and whether I may delete it', async () => {
    const c = await make('sales', { company: companyName, tags: [tagA], note: 'hello' })
    const mine = (await get('sales', `/api/contacts/${c.id}`)).body.contact
    expect(mine).toMatchObject({
      id: c.id,
      company: { name: companyName },
      tags: [tagA],
      related: { notes: 1, deals: 0, leads: 0, tasks: 0, activities: 0 },
      canDelete: true,
    })
    expect(mine.notes[0].body).toBe('hello')

    // Support can read it but not delete; a different salesperson can't delete it either.
    expect((await get('support', `/api/contacts/${c.id}`)).body.contact.canDelete).toBe(false)
    expect((await get('other', `/api/contacts/${c.id}`)).body.contact.canDelete).toBe(false)
    expect((await get('manager', `/api/contacts/${c.id}`)).body.contact.canDelete).toBe(true)
  })
})

describe('PATCH /api/contacts/:id', () => {
  it('requires contacts:write', async () => {
    const c = await make()
    expect((await send('support', 'patch', c.id, { city: 'x' })).status).toBe(403)
    expect((await request(app).patch(`/api/contacts/${c.id}`).send({})).status).toBe(401)
  })

  it('changes only what is sent, and null clears a field', async () => {
    const c = await make('sales', { email: 'a@x.com', city: 'Sofia', phone: '123' })
    const res = await send('other', 'patch', c.id, {
      firstName: 'Zoe',
      city: null,
      email: ' B@X.com ',
    })
    expect(res.status).toBe(200)
    expect(res.body.contact).toMatchObject({
      firstName: 'Zoe',
      lastName: last,
      email: 'b@x.com',
      city: null,
      phone: '123',
      ownerId: salesId,
    })
  })

  it('links, switches and unlinks the company', async () => {
    const c = await make('sales', { company: companyName })
    const other = `Globex ${stamp}`
    const switched = await send('sales', 'patch', c.id, { company: other })
    expect(switched.body.contact.company.name).toBe(other)
    const unlinked = await send('sales', 'patch', c.id, { company: null })
    expect(unlinked.body.contact.company).toBeNull()
    const kept = await send('sales', 'patch', c.id, { city: 'Varna' })
    expect(kept.body.contact.company).toBeNull()
  })

  it('replaces tags, reusing existing ones', async () => {
    const c = await make('sales', { tags: [tagA, tagB] })
    const res = await send('sales', 'patch', c.id, { tags: [tagB.toUpperCase(), 'new-' + stamp] })
    expect(res.body.contact.tags).toEqual([tagB, 'new-' + stamp].sort())
    expect((await send('sales', 'patch', c.id, { tags: [] })).body.contact.tags).toEqual([])
    expect(await prisma.tag.count({ where: { name: { equals: tagB, mode: 'insensitive' } } })).toBe(
      1,
    )
  })

  it('validates, ignores attempts to change the owner, and 404s on unknown ids', async () => {
    const c = await make()
    const bad = await send('sales', 'patch', c.id, {
      firstName: '',
      email: 'nope',
      linkedinUrl: 'x',
    })
    expect(bad.status).toBe(400)
    expect(Object.keys(bad.body.error.details)).toEqual(
      expect.arrayContaining(['firstName', 'email', 'linkedinUrl']),
    )
    const owner = await send('other', 'patch', c.id, { ownerId: 'someone', city: 'Plovdiv' })
    expect(owner.body.contact.ownerId).toBe(salesId)
    expect((await send('sales', 'patch', 'nope', { city: 'x' })).status).toBe(404)
  })
})

describe('DELETE /api/contacts/:id', () => {
  it('requires login and an existing contact', async () => {
    const c = await make()
    expect((await request(app).delete(`/api/contacts/${c.id}`)).status).toBe(401)
    expect((await send('sales', 'delete', 'nope')).status).toBe(404)
  })

  it('lets a salesperson delete their own contact, with everything attached to it', async () => {
    const c = await make('sales', { tags: [tagA], note: 'bye' })
    const res = await send('sales', 'delete', c.id)
    expect(res.status).toBe(204)
    expect(await prisma.contact.count({ where: { id: c.id } })).toBe(0)
    expect(await prisma.note.count({ where: { contactId: c.id } })).toBe(0)
    expect(await prisma.tagOnContact.count({ where: { contactId: c.id } })).toBe(0)
    expect(await prisma.tag.count({ where: { name: tagA } })).toBe(1) // the tag itself stays
    expect((await get('sales', `/api/contacts/${c.id}`)).status).toBe(404)

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'DELETE', entityType: 'Contact', entityId: c.id },
    })
    expect(log).toMatchObject({ userId: salesId, changes: { name: `Zed ${last}` } })
  })

  it('stops a salesperson deleting someone else’s contact, and support deleting anything', async () => {
    const c = await make('sales')
    const other = await send('other', 'delete', c.id)
    expect(other.status).toBe(403)
    expect(other.body.error.message).toBe('You can only delete contacts you own')
    expect((await send('support', 'delete', c.id)).status).toBe(403)
    expect(await prisma.contact.count({ where: { id: c.id } })).toBe(1)
  })

  it('lets a manager delete any contact', async () => {
    const c = await make('sales')
    expect((await send('manager', 'delete', c.id)).status).toBe(204)
  })

  it('keeps the contact’s deals, just unlinked', async () => {
    const c = await make('sales')
    const pipeline = await prisma.pipeline.create({
      data: { name: `ct-${stamp}`, stages: { create: { name: 'S', position: 1 } } },
      include: { stages: true },
    })
    const deal = await prisma.deal.create({
      data: {
        title: `ct-${stamp}-deal`,
        contactId: c.id,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
      },
    })
    expect((await get('sales', `/api/contacts/${c.id}`)).body.contact.related.deals).toBe(1)
    await send('sales', 'delete', c.id)
    expect(await prisma.deal.findUnique({ where: { id: deal.id } })).toMatchObject({
      contactId: null,
    })
  })
})
