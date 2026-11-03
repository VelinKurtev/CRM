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
}
const tokens = { sales: '', support: '' }
let salesId = ''
const last = `ct-${stamp}`
const companyName = `Acme ${stamp}`
const tagA = `vip-${stamp}`
const tagB = `lead-${stamp}`

const post = (who: keyof typeof tokens, body: object) =>
  request(app).post('/api/contacts').set('Authorization', `Bearer ${tokens[who]}`).send(body)
const get = (who: keyof typeof tokens, path: string) =>
  request(app).get(path).set('Authorization', `Bearer ${tokens[who]}`)

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
