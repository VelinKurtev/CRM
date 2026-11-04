import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = {
  sales: `cl-sales-${stamp}@crm.local`,
  other: `cl-other-${stamp}@crm.local`,
  support: `cl-support-${stamp}@crm.local`,
}
const tokens = { sales: '', other: '', support: '' }
const ids = { sales: '', other: '' }
const T = `lt-${stamp}` // on every fixture: isolates this file's contacts from everything else
const V = `vip-${stamp}`
let initechId = ''
let globexId = ''

type Row = { firstName: string; lastName: string; tags: string[]; owner: { id: string } | null }

const list = (who: keyof typeof tokens, query: Record<string, string | string[] | number> = {}) =>
  request(app)
    .get('/api/contacts')
    .query({ tag: T, ...query })
    .set('Authorization', `Bearer ${tokens[who]}`)
const names = (rows: Row[]) => rows.map((r) => r.firstName)

beforeAll(async () => {
  await syncPermissions(prisma)
  const roles = await prisma.role.findMany()
  const passwordHash = await bcrypt.hash(password, 4)
  for (const [key, role] of [
    ['sales', 'SALES'],
    ['other', 'SALES'],
    ['support', 'SUPPORT'],
  ] as const) {
    const u = await prisma.user.create({
      data: {
        email: emails[key],
        passwordHash,
        firstName: key,
        lastName: 'Cl',
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    if (key !== 'support') ids[key] = u.id
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }

  initechId = (await prisma.company.create({ data: { name: `Initech ${stamp}` } })).id
  globexId = (await prisma.company.create({ data: { name: `Globex ${stamp}` } })).id
  const tags = (...names: string[]) => ({
    create: names.map((name) => ({
      tag: { connectOrCreate: { where: { name }, create: { name } } },
    })),
  })
  const make = (data: object) => prisma.contact.create({ data: data as never })
  await make({
    firstName: 'Alice',
    lastName: `Adams${stamp}`,
    email: 'alice@initech.test',
    phone: '111',
    companyId: initechId,
    ownerId: ids.sales,
    createdAt: new Date('2026-01-03'),
    tags: tags(T, V),
  })
  await make({
    firstName: 'Bob',
    lastName: `Baker${stamp}`,
    email: 'bob@globex.test',
    phone: '222',
    companyId: globexId,
    ownerId: ids.other,
    createdAt: new Date('2026-01-01'),
    tags: tags(T),
  })
  await make({
    firstName: 'Carol',
    lastName: `Clark${stamp}`,
    email: 'carol@initech.test',
    jobTitle: 'Designer',
    ownerId: ids.sales,
    createdAt: new Date('2026-01-02'),
    tags: tags(T, V),
  })
})

afterAll(async () => {
  await prisma.contact.deleteMany({ where: { lastName: { endsWith: String(stamp) } } })
  await prisma.company.deleteMany({ where: { name: { contains: String(stamp) } } })
  await prisma.tag.deleteMany({ where: { name: { contains: String(stamp) } } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.$disconnect()
})

describe('GET /api/contacts', () => {
  it('requires login and contacts:read', async () => {
    expect((await request(app).get('/api/contacts')).status).toBe(401)
    expect((await list('support')).status).toBe(200) // support may read contacts
  })

  it('lists contacts with company, owner and sorted tags', async () => {
    const res = await list('sales')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ total: 3, page: 1, pageSize: 20 })
    const alice = res.body.contacts[0]
    expect(alice).toMatchObject({
      firstName: 'Alice',
      email: 'alice@initech.test',
      company: { id: initechId, name: `Initech ${stamp}` },
      owner: { id: ids.sales, firstName: 'sales' },
      tags: [T, V].sort(),
    })
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/)
  })

  it('sorts by name (default), company and date, in both directions', async () => {
    expect(names((await list('sales')).body.contacts)).toEqual(['Alice', 'Bob', 'Carol'])
    expect(names((await list('sales', { dir: 'desc' })).body.contacts)).toEqual([
      'Carol',
      'Bob',
      'Alice',
    ])
    // Globex < Initech, and a contact with no company goes last when ascending.
    expect(names((await list('sales', { sort: 'company' })).body.contacts)).toEqual([
      'Bob',
      'Alice',
      'Carol',
    ])
    expect(names((await list('sales', { sort: 'createdAt' })).body.contacts)).toEqual([
      'Bob',
      'Carol',
      'Alice',
    ])
    expect(names((await list('sales', { sort: 'createdAt', dir: 'desc' })).body.contacts)).toEqual([
      'Alice',
      'Carol',
      'Bob',
    ])
  })

  it('searches name, email, phone, job title and company, ignoring case', async () => {
    const find = async (q: string) => names((await list('sales', { q })).body.contacts)
    expect(await find('ALICE')).toEqual(['Alice'])
    expect(await find('globex.test')).toEqual(['Bob'])
    expect(await find('222')).toEqual(['Bob'])
    expect(await find('designer')).toEqual(['Carol'])
    expect(await find(`globex ${stamp}`)).toEqual(['Bob']) // company name
    expect(await find('initech')).toEqual(['Alice', 'Carol']) // company and email both count
    expect(await find('nobody-like-this')).toEqual([])
  })

  it('needs every word to match, in any order and across fields', async () => {
    const find = async (q: string) => names((await list('sales', { q })).body.contacts)
    expect(await find(`alice adams${stamp}`)).toEqual(['Alice'])
    expect(await find(`adams${stamp} alice`)).toEqual(['Alice'])
    expect(await find('bob initech')).toEqual([]) // Bob is at Globex
    expect(await find('  alice   ')).toEqual(['Alice'])
  })

  it('filters by company, tag and owner, and combines filters', async () => {
    const find = async (who: 'sales' | 'other', query: Record<string, string>) =>
      names((await list(who, query)).body.contacts)
    expect(await find('sales', { company: globexId })).toEqual(['Bob'])
    expect(await find('sales', { tag: V })).toEqual(['Alice', 'Carol'])
    expect(await find('sales', { tag: V.toUpperCase() })).toEqual(['Alice', 'Carol'])
    expect(await find('sales', { owner: 'me' })).toEqual(['Alice', 'Carol'])
    expect(await find('other', { owner: 'me' })).toEqual(['Bob'])
    expect(await find('sales', { tag: V, q: 'carol' })).toEqual(['Carol'])
    expect(await find('sales', { tag: V, company: globexId })).toEqual([])
  })

  it('filters by several tags: any of them by default, or all of them', async () => {
    const find = async (query: Record<string, string | string[]>) =>
      names((await list('sales', query)).body.contacts)
    const ghost = `ghost-${stamp}`
    expect(await find({ tag: [V, ghost] })).toEqual(['Alice', 'Carol']) // either tag
    expect(await find({ tag: [V, ghost], tagMode: 'any' })).toEqual(['Alice', 'Carol'])
    expect(await find({ tag: [V, ghost], tagMode: 'all' })).toEqual([]) // nobody has both
    expect(await find({ tag: [T, V], tagMode: 'all' })).toEqual(['Alice', 'Carol'])
    expect(await find({ tag: [V.toUpperCase(), T.toUpperCase()], tagMode: 'all' })).toEqual([
      'Alice',
      'Carol',
    ])
    // Tags combine with the search and the other filters instead of replacing them.
    expect(await find({ tag: [V, ghost], q: 'carol' })).toEqual(['Carol'])
    expect(await find({ tag: [V, ghost], company: initechId })).toEqual(['Alice']) // Carol has no company
    expect((await list('sales', { tagMode: 'some' })).status).toBe(400)
  })

  it('paginates without repeating or skipping anyone', async () => {
    const one = await list('sales', { pageSize: 2, page: 1 })
    const two = await list('sales', { pageSize: 2, page: 2 })
    expect(one.body).toMatchObject({ total: 3, page: 1, pageSize: 2 })
    expect(names(one.body.contacts)).toEqual(['Alice', 'Bob'])
    expect(names(two.body.contacts)).toEqual(['Carol'])
    expect(names((await list('sales', { pageSize: 2, page: 3 })).body.contacts)).toEqual([])
  })

  it('rejects bad queries with 400', async () => {
    const bad: Record<string, string | number>[] = [
      { pageSize: 101 },
      { page: 0 },
      { sort: 'password' },
      { owner: 'x' },
    ]
    for (const query of bad) {
      expect((await list('sales', query)).status).toBe(400)
    }
    expect((await list('sales', { q: 'x'.repeat(101) })).status).toBe(400)
  })
})

describe('filter dropdown data', () => {
  const get = (path: string) =>
    request(app).get(path).set('Authorization', `Bearer ${tokens.sales}`)

  it('can return more than the default 20 suggestions, up to 100', async () => {
    const res = await get(`/api/tags?q=${stamp}&limit=100`)
    expect(res.body.tags.sort()).toEqual([T, V].sort())
    expect((await get('/api/tags?limit=101')).status).toBe(400)
    expect((await get('/api/companies?limit=0')).status).toBe(400)
    expect((await get(`/api/tags?q=${'x'.repeat(101)}`)).status).toBe(400) // was a 500
  })
})
