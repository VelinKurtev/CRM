import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = {
  sales: `tg-sales-${stamp}@crm.local`,
  support: `tg-support-${stamp}@crm.local`,
  manager: `tg-manager-${stamp}@crm.local`,
}
const tokens = { sales: '', support: '', manager: '' }
const last = `Tg${stamp}`
const hot = `hot-${stamp}`
const cold = `cold-${stamp}`
const fresh = `fresh-${stamp}`
let contactIds: string[] = []

type Who = keyof typeof tokens
const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` })
const bulk = (who: Who, body: object) =>
  request(app).post('/api/contacts/bulk-tags').set(as(who)).send(body)
const tagsOf = async (id: string) =>
  (await prisma.tagOnContact.findMany({ where: { contactId: id }, include: { tag: true } }))
    .map((t) => t.tag.name)
    .sort()
const tagNamed = (name: string) => prisma.tag.findUnique({ where: { name } })

beforeAll(async () => {
  await syncPermissions(prisma)
  const roles = await prisma.role.findMany()
  const passwordHash = await bcrypt.hash(password, 4)
  for (const [key, role] of [
    ['sales', 'SALES'],
    ['support', 'SUPPORT'],
    ['manager', 'MANAGER'],
  ] as const) {
    await prisma.user.create({
      data: {
        email: emails[key],
        passwordHash,
        firstName: key,
        lastName: 'Tg',
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }
})

beforeEach(async () => {
  await prisma.contact.deleteMany({ where: { lastName: last } })
  await prisma.tag.deleteMany({ where: { name: { contains: String(stamp) } } })
  const withTag = (name: string) => ({
    create: { tag: { connectOrCreate: { where: { name }, create: { name } } } },
  })
  const make = (firstName: string, tags?: ReturnType<typeof withTag>) =>
    prisma.contact.create({ data: { firstName, lastName: last, tags } })
  contactIds = [
    (await make('Ann', withTag(hot))).id,
    (await make('Ben', withTag(hot))).id,
    (await make('Cat')).id,
  ]
})

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { action: { in: ['BULK_TAG', 'UPDATE', 'DELETE'] }, entityType: 'Tag' },
  })
  await prisma.auditLog.deleteMany({
    where: {
      action: 'BULK_TAG',
      entityType: 'Contact',
      changes: { path: ['added'], string_contains: String(stamp) },
    },
  })
  await prisma.contact.deleteMany({ where: { lastName: last } })
  await prisma.tag.deleteMany({ where: { name: { contains: String(stamp) } } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.$disconnect()
})

describe('POST /api/contacts/bulk-tags', () => {
  it('needs login and contacts:write', async () => {
    const body = { contactIds, add: [cold] }
    expect((await request(app).post('/api/contacts/bulk-tags').send(body)).status).toBe(401)
    expect((await bulk('support', body)).status).toBe(403)
    expect(await tagNamed(cold)).toBeNull() // a refused request creates nothing
  })

  it('adds tags to every selected contact, creating new tags and keeping existing ones', async () => {
    const res = await bulk('sales', { contactIds, add: [cold, hot.toUpperCase()] })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ updated: 3, skipped: 0 })
    for (const id of contactIds) expect(await tagsOf(id)).toEqual([cold, hot].sort())
    // HOT matched the existing tag whatever its case, so no duplicate was created.
    expect(await prisma.tag.count({ where: { name: { equals: hot, mode: 'insensitive' } } })).toBe(
      1,
    )
  })

  it('removes tags from the selected contacts only', async () => {
    const [ann, ben] = contactIds
    const res = await bulk('sales', {
      contactIds: [ann],
      remove: [hot.toUpperCase(), 'never-used'],
    })
    expect(res.body).toEqual({ updated: 1, skipped: 0 })
    expect(await tagsOf(ann)).toEqual([])
    expect(await tagsOf(ben)).toEqual([hot]) // not selected, untouched
    expect(await tagNamed(hot)).not.toBeNull() // the tag itself stays
    expect(await tagNamed('never-used')).toBeNull()
  })

  it('adds and removes in one request', async () => {
    await bulk('sales', { contactIds, add: [fresh], remove: [hot] })
    for (const id of contactIds) expect(await tagsOf(id)).toEqual([fresh])
  })

  it('skips ids that match no contact and counts them', async () => {
    const res = await bulk('manager', { contactIds: [contactIds[0], 'nope', 'nope'], add: [cold] })
    expect(res.body).toEqual({ updated: 1, skipped: 1 }) // repeated ids count once
    expect(await tagsOf(contactIds[2])).toEqual([])
  })

  it('is safe to repeat', async () => {
    await bulk('sales', { contactIds, add: [cold] })
    const again = await bulk('sales', { contactIds, add: [cold] })
    expect(again.status).toBe(200)
    expect(await tagsOf(contactIds[0])).toEqual([cold, hot].sort())
  })

  it('validates the request', async () => {
    expect((await bulk('sales', { contactIds: [], add: [cold] })).status).toBe(400)
    expect((await bulk('sales', { contactIds, add: [], remove: [] })).status).toBe(400)
    expect((await bulk('sales', { contactIds })).status).toBe(400)
    const clash = await bulk('sales', { contactIds, add: [cold], remove: [cold.toUpperCase()] })
    expect(clash.status).toBe(400)
    expect(clash.body.error.details.remove).toMatch(/both added and removed/)
    const many = Array.from({ length: 501 }, (_, i) => `id${i}`)
    expect((await bulk('sales', { contactIds: many, add: [cold] })).status).toBe(400)
    expect(await tagNamed(cold)).toBeNull()
  })

  it('refuses, and changes nothing, if a contact would end up with over 20 tags', async () => {
    const [ann, , cat] = contactIds // Ann already has one tag, Cat none
    const names = Array.from({ length: 20 }, (_, i) => `many-${i}-${stamp}`)
    const res = await bulk('sales', { contactIds: [cat, ann], add: names })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/more than 20 tags/)
    expect(await tagsOf(cat)).toEqual([]) // Cat alone would have fit, but nothing is half-applied
    expect(await tagNamed(names[0])).toBeNull()
    expect((await bulk('sales', { contactIds: [cat], add: names })).status).toBe(200) // exactly 20
  })

  it('records who tagged what', async () => {
    await bulk('sales', { contactIds, add: [cold], remove: [hot] })
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'BULK_TAG', changes: { path: ['added'], string_contains: String(stamp) } },
      orderBy: { createdAt: 'desc' },
    })
    expect(log.changes).toMatchObject({ contacts: 3, added: cold, removed: hot })
  })
})

describe('GET /api/tags/details', () => {
  it('lists tags with colour and usage, for anyone who can read contacts', async () => {
    await prisma.tag.update({ where: { name: hot }, data: { color: '#ff0000' } })
    const res = await request(app)
      .get('/api/tags/details')
      .query({ q: String(stamp) })
      .set(as('support'))
    expect(res.status).toBe(200)
    expect(res.body.tags).toEqual([
      expect.objectContaining({ name: hot, color: '#ff0000', contactCount: 2, usageCount: 2 }),
    ])
    expect((await request(app).get('/api/tags/details')).status).toBe(401)
    expect((await request(app).get('/api/tags/details?limit=501').set(as('sales'))).status).toBe(
      400,
    )
  })
})

describe('PATCH /api/tags/:id', () => {
  const patch = (who: Who, id: string, body: object) =>
    request(app).patch(`/api/tags/${id}`).set(as(who)).send(body)
  const hotId = async () => (await tagNamed(hot))!.id

  it('is for managers and admins only', async () => {
    const id = await hotId()
    expect((await request(app).patch(`/api/tags/${id}`).send({ name: fresh })).status).toBe(401)
    expect((await patch('sales', id, { name: fresh })).status).toBe(403)
    expect((await patch('support', id, { name: fresh })).status).toBe(403)
    expect(await tagNamed(hot)).not.toBeNull()
  })

  it('renames a tag everywhere it is used, and sets its colour', async () => {
    const id = await hotId()
    const res = await patch('manager', id, { name: `  ${fresh} `, color: '#3B82F6' })
    expect(res.status).toBe(200)
    expect(res.body.tag).toEqual({ id, name: fresh, color: '#3b82f6' })
    expect(await tagsOf(contactIds[0])).toEqual([fresh])
    expect(await tagsOf(contactIds[1])).toEqual([fresh])
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'Tag', entityId: id },
    })
    expect(log.changes).toMatchObject({ name: `${hot} → ${fresh}` })
  })

  it('changes only what is sent, and null clears the colour', async () => {
    const id = await hotId()
    await patch('manager', id, { color: '#00ff00' })
    expect((await tagNamed(hot))?.color).toBe('#00ff00')
    await patch('manager', id, { name: hot.toUpperCase() }) // case-only rename of itself is fine
    expect(await prisma.tag.findUnique({ where: { id } })).toMatchObject({
      name: hot.toUpperCase(),
      color: '#00ff00',
    })
    await patch('manager', id, { color: null })
    expect((await prisma.tag.findUnique({ where: { id } }))?.color).toBeNull()
  })

  it('refuses a name another tag already has, whatever its case', async () => {
    await prisma.tag.create({ data: { name: cold } })
    const res = await patch('manager', await hotId(), { name: cold.toUpperCase() })
    expect(res.status).toBe(409)
    expect(await tagNamed(hot)).not.toBeNull()
  })

  it('validates input and 404s for unknown tags', async () => {
    const id = await hotId()
    expect((await patch('manager', id, {})).status).toBe(400)
    expect((await patch('manager', id, { name: '   ' })).status).toBe(400)
    expect((await patch('manager', id, { name: 'x'.repeat(51) })).status).toBe(400)
    expect((await patch('manager', id, { color: 'red' })).status).toBe(400)
    expect((await patch('manager', 'missing', { name: fresh })).status).toBe(404)
  })
})

describe('DELETE /api/tags/:id', () => {
  const remove = (who: Who, id: string) => request(app).delete(`/api/tags/${id}`).set(as(who))

  it('is for managers and admins only', async () => {
    const id = (await tagNamed(hot))!.id
    expect((await request(app).delete(`/api/tags/${id}`)).status).toBe(401)
    expect((await remove('sales', id)).status).toBe(403)
    expect(await tagNamed(hot)).not.toBeNull()
  })

  it('removes the tag from its contacts but keeps the contacts', async () => {
    const id = (await tagNamed(hot))!.id
    expect((await remove('manager', id)).status).toBe(204)
    expect(await tagNamed(hot)).toBeNull()
    expect(await tagsOf(contactIds[0])).toEqual([])
    expect(await prisma.contact.count({ where: { lastName: last } })).toBe(3)
    expect((await remove('manager', id)).status).toBe(404)
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'DELETE', entityType: 'Tag', entityId: id },
    })
    expect(log.changes).toMatchObject({ name: hot })
  })
})
