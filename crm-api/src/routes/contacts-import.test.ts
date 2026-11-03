import { readFileSync } from 'node:fs'

import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const fixture = (name: string) =>
  readFileSync(new URL(`../test/fixtures/contacts/${name}`, import.meta.url), 'utf8')

const stamp = Date.now()
const password = 'Secret123!'
const emails = { sales: `imp-sales-${stamp}@crm.local`, support: `imp-support-${stamp}@crm.local` }
const tokens = { sales: '', support: '' }
let salesId = ''

const upload = (who: keyof typeof tokens | null, csv: string, dryRun?: boolean) => {
  const r = request(app)
    .post('/api/contacts/import')
    .query(dryRun === undefined ? {} : { dryRun: String(dryRun) })
    .set('Content-Type', 'text/csv')
  return (who ? r.set('Authorization', `Bearer ${tokens[who]}`) : r).send(csv)
}
const withExistingContact = () =>
  prisma.contact.create({
    data: { firstName: 'Kai', lastName: 'Pre-existing', email: 'existing@import-test.example' },
  })
const imported = () =>
  prisma.contact.findMany({ where: { ownerId: salesId }, orderBy: { lastName: 'asc' } })

/** Everything these tests create, so each test starts from a clean slate. */
async function cleanUp() {
  await prisma.contact.deleteMany({
    where: { OR: [{ ownerId: salesId }, { email: { endsWith: '@import-test.example' } }] },
  })
  await prisma.company.deleteMany({
    where: { name: { startsWith: 'Import Test', mode: 'insensitive' } },
  })
  await prisma.tag.deleteMany({ where: { name: { startsWith: 'import-', mode: 'insensitive' } } })
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
        lastName: 'Imp',
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    if (key === 'sales') salesId = u.id
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }
  await cleanUp()
})
beforeEach(cleanUp)

afterAll(async () => {
  await cleanUp()
  await prisma.auditLog.deleteMany({ where: { userId: salesId } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.$disconnect()
})

describe('POST /api/contacts/import: access and file problems', () => {
  it('requires login and contacts:write', async () => {
    expect((await upload(null, fixture('valid.csv'))).status).toBe(401)
    expect((await upload('support', fixture('valid.csv'))).status).toBe(403)
  })

  it('refuses a file with no first/last name column, naming what is missing', async () => {
    const res = await upload('sales', fixture('missing-columns.csv'))
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/"last name" column/)
  })

  it('refuses text that is not valid CSV', async () => {
    const res = await upload('sales', fixture('unclosed-quote.csv'))
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/not valid CSV/)
    expect(await imported()).toHaveLength(0)
  })

  it('refuses empty files, header-only files and non-CSV requests', async () => {
    expect((await upload('sales', '')).status).toBe(400)
    const headerOnly = await upload('sales', fixture('header-only.csv'))
    expect(headerOnly.body.error.message).toMatch(/no contacts/)
    const json = await request(app)
      .post('/api/contacts/import')
      .set('Authorization', `Bearer ${tokens.sales}`)
      .send({ csv: 'x' })
    expect(json.status).toBe(400)
  })

  it('limits the number of rows and the size of the file', async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => `A${i},B${i}`).join('\n')
    const tooMany = await upload('sales', `first_name,last_name\n${rows}`)
    expect(tooMany.status).toBe(400)
    expect(tooMany.body.error.message).toMatch(/at most 2000/)

    const huge = await upload('sales', `first_name,last_name\n${'x'.repeat(2.5 * 1024 * 1024)}`)
    expect(huge.status).toBe(413)
    expect(await imported()).toHaveLength(0)
  })
})

describe('importing a valid file', () => {
  it('previews without saving anything when dryRun is set', async () => {
    const res = await upload('sales', fixture('valid.csv'), true)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ dryRun: true, total: 6, valid: 6, imported: 0, rejected: [] })
    expect(await imported()).toHaveLength(0)
    expect(
      await prisma.company.count({
        where: { name: { startsWith: 'Import Test', mode: 'insensitive' } },
      }),
    ).toBe(0)
  })

  it('creates every contact with its company, tags, address, links and note', async () => {
    const res = await upload('sales', fixture('valid.csv'))
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ total: 6, valid: 6, imported: 6, rejected: [], dryRun: false })

    const all = await prisma.contact.findMany({
      where: { ownerId: salesId },
      include: { company: true, tags: { include: { tag: true } }, notes: true },
    })
    expect(all).toHaveLength(6)
    const by = (last: string) => all.find((c) => c.lastName === last)!

    const anna = by('Ivanova')
    expect(anna).toMatchObject({
      firstName: 'Anna',
      email: 'anna.ivanova@import-test.example',
      phone: '+359 88 111 1111',
      jobTitle: 'CTO',
      address: '12 Vitosha Blvd',
      city: 'Sofia',
      postalCode: '1000',
      country: 'Bulgaria',
      linkedinUrl: 'https://linkedin.com/in/anna',
      twitterUrl: 'https://x.com/anna',
      facebookUrl: 'https://facebook.com/anna',
      ownerId: salesId,
    })
    expect(anna.tags.map((t) => t.tag.name).sort()).toEqual(['import-test', 'import-vip'])
    expect(anna.notes.map((n) => n.body)).toEqual(['Met at the Sofia conference'])
    expect(anna.notes[0]).toMatchObject({ authorId: salesId })

    // Quoted cells: a note over two lines, and a company name containing a comma.
    expect(by('Petrov').notes[0].body).toBe('Prefers email.\nCall after 5pm only.')
    const ivan = all.find((c) => c.lastName === 'Петров')!
    expect(ivan).toMatchObject({ firstName: 'Иван', city: 'Варна', country: 'България' })
    expect(ivan.company?.name).toBe('Import Test Globex, Inc.')
    expect(ivan.tags.map((t) => t.tag.name).sort()).toEqual(['import-hot', 'import-vip'])

    // Blank cells stay empty; a row may be just a name.
    expect(by('Santos')).toMatchObject({ email: null, phone: null, companyId: null })
  })

  it('reuses companies and tags whatever their letter case, instead of duplicating them', async () => {
    await upload('sales', fixture('valid.csv'))
    const companies = await prisma.company.findMany({
      where: { name: { startsWith: 'Import Test' } },
    })
    // "Import Test Initech" and "IMPORT TEST INITECH" are one company.
    expect(companies.filter((c) => /initech/i.test(c.name))).toHaveLength(1)
    const tags = await prisma.tag.findMany({
      where: { name: { startsWith: 'import-', mode: 'insensitive' } },
    })
    expect(tags.map((t) => t.name).sort()).toEqual(['import-hot', 'import-test', 'import-vip'])
  })

  it('reads an Excel-style file: BOM, semicolons, Windows line endings, friendly headers', async () => {
    const res = await upload('sales', fixture('valid-excel-semicolon.csv'))
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ imported: 2, rejected: [], ignoredColumns: ['Internal ID'] })
    const nikolay = (await imported()).find((c) => c.firstName === 'Nikolay')!
    expect(nikolay).toMatchObject({
      email: 'nikolay.georgiev@import-test.example',
      phone: '+359 88 333 3333',
      jobTitle: 'Sales lead',
      postalCode: '1000',
    })
  })

  it('records the import in the audit log', async () => {
    await withExistingContact()
    await upload('sales', fixture('with-errors.csv'))
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { userId: salesId, action: 'IMPORT' },
      orderBy: { createdAt: 'desc' },
    })
    expect(log.changes).toMatchObject({ imported: 3, skipped: 8 })
  })

  it('skips everyone with an email on a second run, but cannot match people without one', async () => {
    await upload('sales', fixture('valid.csv'))
    const again = await upload('sales', fixture('valid.csv'))
    expect(again.body.rejected).toHaveLength(5)
    expect(again.body.rejected[0].errors.email).toBe('A contact with this email already exists')
    // Carla has no email, so there is nothing to recognise her by: she is added again.
    expect(again.body.imported).toBe(1)
    expect((await imported()).filter((c) => c.lastName === 'Santos')).toHaveLength(2)
  })

  it('splits tags on ; , or | and keeps ; inside a comma-separated file’s cells', async () => {
    const csv =
      'first_name,last_name,tags\nTom,One,import-a;import-b\nTim,Two,"import-b, import-c"\nTed,Three,import-c|import-a'
    const res = await upload('sales', csv)
    expect(res.body.imported).toBe(3)
    const tags = await prisma.tagOnContact.findMany({
      where: { contact: { ownerId: salesId } },
      include: { tag: true },
    })
    expect(tags).toHaveLength(6)
    expect([...new Set(tags.map((t) => t.tag.name))].sort()).toEqual([
      'import-a',
      'import-b',
      'import-c',
    ])
  })
})

describe('importing a file with mistakes', () => {
  const run = async (dryRun?: boolean) => {
    await withExistingContact()
    return upload('sales', fixture('with-errors.csv'), dryRun)
  }

  it('imports the good rows and reports each bad one with its row number and reason', async () => {
    const res = await run()
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ total: 11, valid: 3, imported: 3 })

    const byRow = Object.fromEntries(
      res.body.rejected.map((r: { row: number }) => [r.row, r]),
    ) as Record<number, { errors: Record<string, string>; name: string }>
    expect(res.body.rejected.map((r: { row: number }) => r.row)).toEqual([3, 4, 5, 6, 8, 9, 10, 12])

    expect(byRow[3].errors).toEqual({ firstName: 'First name is required' })
    expect(byRow[4].errors).toEqual({ lastName: 'Last name is required' })
    expect(byRow[5].errors).toEqual({ email: 'Enter a valid email' })
    expect(byRow[6].errors).toEqual({ linkedinUrl: 'Enter a valid URL' })
    expect(byRow[8].errors).toEqual({ email: 'Same email as row 2 in this file' })
    expect(byRow[9].errors).toEqual({ email: 'A contact with this email already exists' })
    expect(byRow[10].errors).toEqual({ tags: 'At most 20 tags' })
    expect(Object.keys(byRow[12].errors).sort()).toEqual(['email', 'firstName', 'lastName'])
    expect(byRow[8].name).toBe('Fiona Again')
  })

  it('saves only the valid rows', async () => {
    await run()
    const saved = (await imported()).map((c) => c.lastName).sort()
    expect(saved).toEqual(['Good', 'NoEmail', 'Valid'])
    // Nothing from a rejected row leaks in: not the contact, its company or its tags.
    expect(await prisma.tag.count({ where: { name: { in: ['t01', 't21'] } } })).toBe(0)
    expect(await prisma.contact.count({ where: { email: 'not-an-email' } })).toBe(0)
  })

  it('gives the same answer as a preview, without saving', async () => {
    const preview = await run(true)
    expect(preview.status).toBe(200)
    expect(preview.body).toMatchObject({ dryRun: true, total: 11, valid: 3, imported: 0 })
    expect(preview.body.rejected).toHaveLength(8)
    expect(await imported()).toHaveLength(0)
  })

  it('reports a file where every row is bad without creating anything', async () => {
    const res = await upload('sales', 'first_name,last_name,email\n,,x\n,,y')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ valid: 0, imported: 0 })
    expect(res.body.rejected).toHaveLength(2)
  })
})
