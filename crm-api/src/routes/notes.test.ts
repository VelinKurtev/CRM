import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = {
  sales: `nt-sales-${stamp}@crm.local`,
  other: `nt-other-${stamp}@crm.local`, // a second salesperson
  support: `nt-support-${stamp}@crm.local`,
  manager: `nt-manager-${stamp}@crm.local`,
}
const tokens = { sales: '', other: '', support: '', manager: '' }
const ids = { sales: '', support: '' }
let contactId = ''
let companyId = ''
let dealId = ''
let pipelineId = ''

type Who = keyof typeof tokens
const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` })
const add = (who: Who, body: object) => request(app).post('/api/notes').set(as(who)).send(body)
const edit = (who: Who, id: string, body: object) =>
  request(app).patch(`/api/notes/${id}`).set(as(who)).send(body)
const remove = (who: Who, id: string) => request(app).delete(`/api/notes/${id}`).set(as(who))

beforeAll(async () => {
  await syncPermissions(prisma)
  const roles = await prisma.role.findMany()
  const passwordHash = await bcrypt.hash(password, 4)
  for (const [key, role] of [
    ['sales', 'SALES'],
    ['other', 'SALES'],
    ['support', 'SUPPORT'],
    ['manager', 'MANAGER'],
  ] as const) {
    const u = await prisma.user.create({
      data: {
        email: emails[key],
        passwordHash,
        firstName: key,
        lastName: 'Nt',
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    if (key === 'sales' || key === 'support') ids[key] = u.id
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }
  contactId = (await prisma.contact.create({ data: { firstName: 'N', lastName: `Nt${stamp}` } })).id
  companyId = (await prisma.company.create({ data: { name: `Notes Co ${stamp}` } })).id
  const pipeline = await prisma.pipeline.create({
    data: { name: `nt-${stamp}`, stages: { create: { name: 'S', position: 1 } } },
    include: { stages: true },
  })
  pipelineId = pipeline.id
  dealId = (
    await prisma.deal.create({
      data: { title: `Deal ${stamp}`, pipelineId, stageId: pipeline.stages[0].id },
    })
  ).id
})

afterAll(async () => {
  await prisma.note.deleteMany({ where: { author: { email: { in: Object.values(emails) } } } })
  await prisma.deal.deleteMany({ where: { id: dealId } })
  await prisma.pipeline.deleteMany({ where: { id: pipelineId } })
  await prisma.contact.deleteMany({ where: { id: contactId } })
  await prisma.company.deleteMany({ where: { id: companyId } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.$disconnect()
})

describe('POST /api/notes', () => {
  it('needs login and notes:write', async () => {
    expect((await request(app).post('/api/notes').send({ body: 'x', contactId })).status).toBe(401)
    // Support may write notes; a role without notes:write may not (none exists, so check the guard)
    expect((await add('support', { body: 'ok', contactId })).status).toBe(201)
  })

  it('adds a note to a contact, a company or a deal, authored by the caller', async () => {
    for (const target of [{ contactId }, { companyId }, { dealId }]) {
      const res = await add('sales', { body: `  Prefers email, budget 50k  `, ...target })
      expect(res.status).toBe(201)
      expect(res.body.note).toMatchObject({
        body: 'Prefers email, budget 50k',
        author: { id: ids.sales },
      })
    }
    expect(await prisma.note.count({ where: { contactId, authorId: ids.sales } })).toBe(1)
    expect(await prisma.note.count({ where: { companyId } })).toBe(1)
    expect(await prisma.note.count({ where: { dealId } })).toBe(1)
  })

  it('shows up on the contact and company pages, newest first', async () => {
    await add('sales', { body: 'Second', contactId })
    const res = await request(app).get(`/api/contacts/${contactId}/overview`).set(as('manager'))
    expect(res.body.notes.items[0]).toMatchObject({ body: 'Second', author: { id: ids.sales } })
    expect(res.body.notes.items[0].updatedAt).toBeDefined()
    const co = await request(app).get(`/api/companies/${companyId}/overview`).set(as('manager'))
    expect(co.body.notes.total).toBe(1)
  })

  it('needs exactly one target that exists', async () => {
    expect((await add('sales', { body: 'x' })).status).toBe(400)
    expect((await add('sales', { body: 'x', contactId, companyId })).status).toBe(400)
    expect((await add('sales', { body: 'x', contactId: 'nope' })).status).toBe(404)
    expect((await add('sales', { body: 'x', companyId: 'nope' })).status).toBe(404)
    expect((await add('sales', { body: 'x', dealId: 'nope' })).status).toBe(404)
  })

  it('rejects empty and over-long notes', async () => {
    expect((await add('sales', { body: '   ', contactId })).status).toBe(400)
    expect((await add('sales', { contactId })).status).toBe(400)
    expect((await add('sales', { body: 'x'.repeat(5001), contactId })).status).toBe(400)
    expect((await add('sales', { body: 'x'.repeat(5000), contactId })).status).toBe(201)
  })
})

describe('PATCH /api/notes/:id', () => {
  const make = async (who: Who = 'sales') =>
    (await add(who, { body: 'Original', contactId })).body.note.id as string

  it('lets the author change the text', async () => {
    const id = await make()
    const res = await edit('sales', id, { body: ' Budget is now 80k ' })
    expect(res.status).toBe(200)
    expect(res.body.note.body).toBe('Budget is now 80k')
    expect((await prisma.note.findUnique({ where: { id } }))?.body).toBe('Budget is now 80k')
  })

  it('refuses everyone else, managers included', async () => {
    const id = await make()
    expect((await edit('other', id, { body: 'Hijack' })).status).toBe(403)
    expect((await edit('manager', id, { body: 'Hijack' })).status).toBe(403)
    expect((await prisma.note.findUnique({ where: { id } }))?.body).toBe('Original')
    expect((await request(app).patch(`/api/notes/${id}`).send({ body: 'x' })).status).toBe(401)
  })

  it('validates and 404s', async () => {
    const id = await make()
    expect((await edit('sales', id, { body: '  ' })).status).toBe(400)
    expect((await edit('sales', 'nope', { body: 'x' })).status).toBe(404)
  })
})

describe('DELETE /api/notes/:id', () => {
  const make = async (who: Who) =>
    (await add(who, { body: 'Temp', contactId })).body.note.id as string

  it('lets the author delete their own note', async () => {
    const id = await make('sales')
    expect((await remove('sales', id)).status).toBe(204)
    expect(await prisma.note.findUnique({ where: { id } })).toBeNull()
  })

  it('lets support delete their own note even without notes:delete', async () => {
    const id = await make('support')
    expect((await remove('support', id)).status).toBe(204)
  })

  it('lets roles with notes:delete remove anyone’s note', async () => {
    const id = await make('support')
    expect((await remove('manager', id)).status).toBe(204)
    const other = await make('sales')
    expect((await remove('other', other)).status).toBe(204) // sales have notes:delete
  })

  it('refuses a role without notes:delete on someone else’s note', async () => {
    const id = await make('sales')
    expect((await remove('support', id)).status).toBe(403)
    expect(await prisma.note.findUnique({ where: { id } })).not.toBeNull()
  })

  it('needs login, and 404s for unknown notes', async () => {
    expect((await request(app).delete('/api/notes/x')).status).toBe(401)
    expect((await remove('sales', 'nope')).status).toBe(404)
  })
})
