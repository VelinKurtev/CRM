import bcrypt from 'bcryptjs'
import { parse } from 'csv-parse/sync'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { parseContactsCsv } from '../lib/contact-csv.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'
import { EXPORT_COLUMNS } from './contacts-export.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = {
  manager: `ex-manager-${stamp}@crm.local`,
  sales: `ex-sales-${stamp}@crm.local`,
  support: `ex-support-${stamp}@crm.local`,
}
const tokens = { manager: '', sales: '', support: '' }
let managerId = ''
const T = `ex-${stamp}` // on every fixture contact, to isolate them from other data
const BOM = '﻿'

const download = (who: keyof typeof tokens | null, query: Record<string, string> = {}) => {
  const r = request(app)
    .get('/api/contacts/export')
    .query({ tag: T, ...query })
  return who ? r.set('Authorization', `Bearer ${tokens[who]}`) : r
}
const rows = (text: string) =>
  parse(text.replace(BOM, ''), { columns: true, skip_empty_lines: true }) as Record<
    string,
    string
  >[]

beforeAll(async () => {
  await syncPermissions(prisma)
  const roles = await prisma.role.findMany()
  const passwordHash = await bcrypt.hash(password, 4)
  for (const [key, role] of [
    ['manager', 'MANAGER'],
    ['sales', 'SALES'],
    ['support', 'SUPPORT'],
  ] as const) {
    const u = await prisma.user.create({
      data: {
        email: emails[key],
        passwordHash,
        firstName: key,
        lastName: 'Ex',
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    if (key === 'manager') managerId = u.id
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }

  const tag = { create: { tag: { connectOrCreate: { where: { name: T }, create: { name: T } } } } }
  const company = await prisma.company.create({ data: { name: `Acme, "Inc." ${stamp}` } })
  // More than a page and a batch's worth of plain contacts, to prove nothing is cut off.
  for (let i = 0; i < 25; i++) {
    await prisma.contact.create({
      data: {
        firstName: `Plain${String(i).padStart(2, '0')}`,
        lastName: `Export${stamp}`,
        email: `plain${i}-${stamp}@export-test.example`,
        tags: tag,
      },
    })
  }
  await prisma.contact.create({
    data: {
      firstName: 'Иван',
      lastName: `Tricky${stamp}`,
      email: `tricky-${stamp}@export-test.example`,
      phone: '+359 88 111 1111',
      jobTitle: '=HYPERLINK("http://evil.example","click")',
      address: '1 Main St\nFloor 2',
      city: 'Варна',
      companyId: company.id,
      ownerId: managerId,
      tags: {
        create: ['b-tag', 'a-tag'].map((name) => ({
          tag: {
            connectOrCreate: {
              where: { name: `${name}-${stamp}` },
              create: { name: `${name}-${stamp}` },
            },
          },
        })),
      },
    },
  })
  const tricky = await prisma.contact.findFirstOrThrow({ where: { lastName: `Tricky${stamp}` } })
  await prisma.tagOnContact.create({
    data: {
      contactId: tricky.id,
      tagId: (await prisma.tag.findUniqueOrThrow({ where: { name: T } })).id,
    },
  })
})

afterAll(async () => {
  await prisma.contact.deleteMany({ where: { email: { endsWith: '@export-test.example' } } })
  await prisma.company.deleteMany({ where: { name: { contains: String(stamp) } } })
  await prisma.tag.deleteMany({ where: { name: { contains: String(stamp) } } })
  await prisma.auditLog.deleteMany({ where: { userId: managerId } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.$disconnect()
})

describe('GET /api/contacts/export', () => {
  it('is for managers and admins only', async () => {
    expect((await download(null)).status).toBe(401)
    expect((await download('sales')).status).toBe(403)
    expect((await download('support')).status).toBe(403)
    expect((await download('manager')).status).toBe(200)
  })

  it('sends a UTF-8 CSV attachment that Excel reads correctly and nothing caches', async () => {
    const res = await download('manager')
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="contacts-\d{4}-\d{2}-\d{2}\.csv"$/,
    )
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.text.startsWith(BOM + EXPORT_COLUMNS.join(',') + '\r\n')).toBe(true)
  })

  it('exports every matching contact, not just one page', async () => {
    const list = rows((await download('manager')).text)
    expect(list).toHaveLength(26) // 25 plain + 1 tricky; the list page would stop at 20
    expect(list.map((r) => r.last_name).filter((n) => n === `Export${stamp}`)).toHaveLength(25)
  })

  it('applies the same search and filters as the list', async () => {
    expect(rows((await download('manager', { q: 'plain07' })).text)).toHaveLength(1)
    expect(rows((await download('manager', { q: `tricky-${stamp}` })).text)).toHaveLength(1)
    expect(
      rows((await download('manager', { owner: 'me' })).text).map((r) => r.first_name),
    ).toEqual(['Иван'])
    expect(rows((await download('manager', { q: 'nobody-matches-this' })).text)).toEqual([])
    const empty = await download('manager', { q: 'nobody-matches-this' })
    expect(empty.text).toBe(BOM + EXPORT_COLUMNS.join(',') + '\r\n') // still a valid file
  })

  it('writes awkward values so they read back exactly, and defuses formulas', async () => {
    const [tricky] = rows((await download('manager', { q: `tricky-${stamp}` })).text)
    expect(tricky).toMatchObject({
      first_name: 'Иван',
      city: 'Варна',
      phone: '+359 88 111 1111', // a plain phone number is not mangled
      address: '1 Main St\nFloor 2',
      company: `Acme, "Inc." ${stamp}`,
      tags: [`a-tag-${stamp}`, `b-tag-${stamp}`, T].sort().join('; '),
      owner: 'manager Ex',
    })
    // Would otherwise run as a formula when opened in Excel.
    expect(tricky.job_title).toBe(`'=HYPERLINK("http://evil.example","click")`)
    expect(tricky.created).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('can use semicolons for Excel in European locales', async () => {
    const res = await download('manager', { delimiter: 'semicolon', q: `tricky-${stamp}` })
    const [header] = res.text.replace(BOM, '').split('\r\n')
    expect(header).toBe(EXPORT_COLUMNS.join(';'))
    const [tricky] = parse(res.text.replace(BOM, ''), {
      columns: true,
      delimiter: ';',
    }) as Record<string, string>[]
    expect(tricky.tags).toContain('a-tag') // the cell holds ';' so it was quoted, not split
  })

  it('can be imported again: the import understands the export', async () => {
    const { rows: parsed, ignoredColumns } = parseContactsCsv((await download('manager')).text)
    expect(parsed).toHaveLength(26)
    expect(ignoredColumns).toEqual(['owner', 'created'])
    const tricky = parsed.find((r) => r.fields.lastName === `Tricky${stamp}`)!.fields
    expect(tricky).toMatchObject({
      firstName: 'Иван',
      email: `tricky-${stamp}@export-test.example`,
    })
    expect(tricky.tags).toEqual([`a-tag-${stamp}`, `b-tag-${stamp}`, T].sort())
  })

  it('records who exported what in the audit log', async () => {
    await download('manager', { q: 'plain1' })
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { userId: managerId, action: 'EXPORT' },
      orderBy: { createdAt: 'desc' },
    })
    expect(log.changes).toMatchObject({ q: 'plain1', tag: T, rows: 11 }) // plain1, plain10–19
  })

  it('rejects bad options', async () => {
    expect((await download('manager', { delimiter: 'tab' })).status).toBe(400)
    expect((await download('manager', { owner: 'x' })).status).toBe(400)
  })
})
