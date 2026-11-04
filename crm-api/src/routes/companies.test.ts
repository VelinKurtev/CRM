import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = {
  sales: `co-sales-${stamp}@crm.local`,
  support: `co-support-${stamp}@crm.local`,
}
const tokens = { sales: '', support: '' }
let salesId = ''
const name = (n: string) => `${n} Co ${stamp}`

type Who = keyof typeof tokens
const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` })
const create = (who: Who, body: object) =>
  request(app).post('/api/companies').set(as(who)).send(body)
const patch = (who: Who, id: string, body: object) =>
  request(app).patch(`/api/companies/${id}`).set(as(who)).send(body)

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
        lastName: 'Co',
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    if (key === 'sales') salesId = u.id
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }
})

afterAll(async () => {
  await prisma.company.deleteMany({ where: { name: { contains: String(stamp) } } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.$disconnect()
})

describe('POST /api/companies', () => {
  it('needs login and companies:write', async () => {
    expect(
      (
        await request(app)
          .post('/api/companies')
          .send({ name: name('x') })
      ).status,
    ).toBe(401)
    expect((await create('support', { name: name('Support') })).status).toBe(403)
    expect(await prisma.company.count({ where: { name: name('Support') } })).toBe(0)
  })

  it('creates a company with all its details, owned by the caller', async () => {
    const res = await create('sales', {
      name: `  ${name('Full')} `,
      industry: 'Software',
      employees: 250,
      revenue: 1250000.5,
      website: 'https://full.example.com',
    })
    expect(res.status).toBe(201)
    expect(res.body.company).toMatchObject({
      name: name('Full'),
      industry: 'Software',
      employees: 250,
      revenue: 1250000.5,
      website: 'https://full.example.com',
      owner: { id: salesId },
      contactCount: 0,
      dealCount: 0,
    })
  })

  it('needs only a name', async () => {
    const res = await create('sales', { name: name('Bare') })
    expect(res.status).toBe(201)
    expect(res.body.company).toMatchObject({
      industry: null,
      employees: null,
      revenue: null,
      website: null,
    })
  })

  it('accepts zero employees and zero revenue', async () => {
    const res = await create('sales', { name: name('Zero'), employees: 0, revenue: 0 })
    expect(res.body.company).toMatchObject({ employees: 0, revenue: 0 })
  })

  it('validates every field', async () => {
    const bad = async (body: object) =>
      (await create('sales', { name: name('Bad'), ...body })).status
    expect((await create('sales', {})).status).toBe(400)
    expect(await bad({ name: '   ' })).toBe(400)
    expect(await bad({ name: 'x'.repeat(201) })).toBe(400)
    expect(await bad({ employees: -1 })).toBe(400)
    expect(await bad({ employees: 1.5 })).toBe(400)
    expect(await bad({ employees: '10' })).toBe(400)
    expect(await bad({ revenue: -5 })).toBe(400)
    expect(await bad({ revenue: 1.005 })).toBe(400)
    expect(await bad({ revenue: 1e13 })).toBe(400)
    expect(await bad({ website: 'not a url' })).toBe(400)
    expect(await bad({ website: 'javascript:alert(1)' })).toBe(400)
    expect(await prisma.company.count({ where: { name: name('Bad') } })).toBe(0)
  })

  it('refuses a name that exists, whatever its letter case', async () => {
    await create('sales', { name: name('Dup') })
    const res = await create('sales', { name: name('Dup').toUpperCase() })
    expect(res.status).toBe(409)
    expect(res.body.error.details.name).toMatch(/already exists/)
  })
})

describe('GET /api/companies/:id', () => {
  it('returns the company with its contact and deal counts', async () => {
    const id = (await create('sales', { name: name('Counted') })).body.company.id
    await prisma.contact.create({ data: { firstName: 'A', lastName: `Co${stamp}`, companyId: id } })
    const res = await request(app).get(`/api/companies/${id}`).set(as('support')) // read-only role
    expect(res.status).toBe(200)
    expect(res.body.company).toMatchObject({ id, name: name('Counted'), contactCount: 1 })
    await prisma.contact.deleteMany({ where: { lastName: `Co${stamp}` } })
  })

  it('404s for an unknown company and needs login', async () => {
    expect((await request(app).get('/api/companies/nope').set(as('sales'))).status).toBe(404)
    expect((await request(app).get('/api/companies/nope')).status).toBe(401)
  })
})

describe('PATCH /api/companies/:id', () => {
  const make = async (n: string, extra: object = {}) =>
    (await create('sales', { name: name(n), ...extra })).body.company.id as string

  it('needs companies:write', async () => {
    const id = await make('Locked')
    expect((await patch('support', id, { industry: 'x' })).status).toBe(403)
    expect((await request(app).patch(`/api/companies/${id}`).send({})).status).toBe(401)
  })

  it('changes only what is sent', async () => {
    const id = await make('Edit', { industry: 'Retail', employees: 10, revenue: 5 })
    const res = await patch('sales', id, { name: name('Edited'), employees: 20 })
    expect(res.status).toBe(200)
    expect(res.body.company).toMatchObject({
      name: name('Edited'),
      industry: 'Retail',
      employees: 20,
      revenue: 5,
    })
  })

  it('clears optional fields with null', async () => {
    const id = await make('Clear', {
      industry: 'Retail',
      employees: 10,
      revenue: 5,
      website: 'https://a.example.com',
    })
    const res = await patch('sales', id, {
      industry: null,
      employees: null,
      revenue: null,
      website: null,
    })
    expect(res.body.company).toMatchObject({
      industry: null,
      employees: null,
      revenue: null,
      website: null,
    })
  })

  it('cannot clear the name, and validates like create', async () => {
    const id = await make('Valid')
    expect((await patch('sales', id, { name: null })).status).toBe(400)
    expect((await patch('sales', id, { name: '  ' })).status).toBe(400)
    expect((await patch('sales', id, { employees: -2 })).status).toBe(400)
    expect((await patch('sales', id, { website: 'ftp://x' })).status).toBe(400)
  })

  it('refuses another company’s name, but allows keeping or re-casing its own', async () => {
    const a = await make('Alpha')
    await make('Beta')
    expect((await patch('sales', a, { name: name('beta') })).status).toBe(409)
    expect((await patch('sales', a, { name: name('Alpha') })).status).toBe(200)
    const recased = await patch('sales', a, { name: name('ALPHA') })
    expect(recased.body.company.name).toBe(name('ALPHA'))
  })

  it('404s for an unknown company', async () => {
    expect((await patch('sales', 'nope', { industry: 'x' })).status).toBe(404)
  })
})

describe('GET /api/companies/details', () => {
  it('lists, searches by name or industry, and pages', async () => {
    for (const n of ['Zed', 'Yan', 'Xi'])
      await create('sales', { name: name(n), industry: `Ind${n}${stamp}` })
    const get = (query: object) =>
      request(app).get('/api/companies/details').query(query).set(as('support'))

    const all = await get({ q: String(stamp), pageSize: 2 })
    expect(all.status).toBe(200)
    expect(all.body.page).toBe(1)
    expect(all.body.companies.length).toBe(2)
    expect(all.body.total).toBeGreaterThanOrEqual(3)

    const names = all.body.companies.map((c: { name: string }) => c.name)
    expect(names).toEqual([...names].sort())

    const byIndustry = await get({ q: `IndYan${stamp}` })
    expect(byIndustry.body.companies.map((c: { name: string }) => c.name)).toEqual([name('Yan')])

    expect((await get({ pageSize: 101 })).status).toBe(400)
    expect((await request(app).get('/api/companies/details')).status).toBe(401)
  })
})
