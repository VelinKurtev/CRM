import { readdirSync, readFileSync } from 'node:fs'

import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_LEAD } from './lead-attachments.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = { sales: `at-sales-${stamp}@crm.local`, support: `at-support-${stamp}@crm.local` }
const tokens = { sales: '', support: '' }
let salesId = ''

type Who = keyof typeof tokens
const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` })
const newLead = async (label: string) =>
  (await prisma.lead.create({ data: { title: `${label} Att ${stamp}`, ownerId: salesId } })).id

const upload = (who: Who, leadId: string, body: Buffer | string, query: object = {}) =>
  request(app)
    .post(`/api/leads/${leadId}/attachments`)
    .query({ name: 'proposal.pdf', type: 'application/pdf', ...query })
    .set(as(who))
    .set('Content-Type', 'application/octet-stream')
    .send(body)

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
        lastName: 'At',
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    if (key === 'sales') salesId = u.id
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }
})

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { title: { contains: String(stamp) } } })
  await prisma.auditLog.deleteMany({ where: { userId: salesId } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.$disconnect()
})

describe('attaching a file', () => {
  it('needs login and leads:write', async () => {
    const id = await newLead('perm')
    expect(
      (
        await request(app)
          .post(`/api/leads/${id}/attachments`)
          .query({ name: 'a.txt' })
          .set('Content-Type', 'application/octet-stream')
          .send('hi')
      ).status,
    ).toBe(401)
    expect((await upload('support', id, 'hi')).status).toBe(403)
  })

  it('stores the file and lists it with who added it', async () => {
    const id = await newLead('store')
    const res = await upload('sales', id, Buffer.from('%PDF-1.4 hello'))
    expect(res.status).toBe(201)
    expect(res.body.attachment).toMatchObject({
      name: 'proposal.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 14,
      uploadedBy: { id: salesId },
    })
    expect(res.body.attachment).not.toHaveProperty('data')

    const list = await request(app).get(`/api/leads/${id}/attachments`).set(as('sales'))
    expect(list.status).toBe(200)
    expect(list.body.attachments.map((a: { id: string }) => a.id)).toEqual([res.body.attachment.id])
    expect(list.body.attachments[0]).not.toHaveProperty('data')

    const lead = await request(app).get(`/api/leads/${id}`).set(as('sales'))
    expect(lead.body.lead.attachmentCount).toBe(1)
    expect(
      await prisma.auditLog.count({
        where: { action: 'LEAD_ATTACHMENT_ADDED', entityId: id, userId: salesId },
      }),
    ).toBe(1)
  })

  it('keeps any bytes intact, including a file that claims to be JSON or HTML', async () => {
    const id = await newLead('bytes')
    const bytes = Buffer.from([0, 255, 1, 254, 0x7b, 0x7d, 10, 13])
    const json = await upload('sales', id, bytes, { name: 'data.json', type: 'application/json' })
    expect(json.status).toBe(201)
    const down = await request(app)
      .get(`/api/leads/${id}/attachments/${json.body.attachment.id}`)
      .set(as('support'))
    // Support has no lead access at all.
    expect(down.status).toBe(403)
    const ok = await request(app)
      .get(`/api/leads/${id}/attachments/${json.body.attachment.id}`)
      .set(as('sales'))
      .buffer()
      .parse((res, cb) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => cb(null, Buffer.concat(chunks)))
      })
    expect(ok.status).toBe(200)
    expect(Buffer.compare(ok.body as Buffer, bytes)).toBe(0)
    expect(ok.headers['content-type']).toContain('application/json')
  })

  it('serves files as downloads that can not run in the page', async () => {
    const id = await newLead('safe')
    const up = await upload('sales', id, '<script>alert(1)</script>', {
      name: 'résumé "x".html',
      type: 'text/html',
    })
    const res = await request(app)
      .get(`/api/leads/${id}/attachments/${up.body.attachment.id}`)
      .set(as('sales'))
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="r_sum_ _x_\.html"/)
    expect(res.headers['content-disposition']).toContain(
      "filename*=UTF-8''r%C3%A9sum%C3%A9%20%22x%22.html",
    )
    expect(res.headers['content-security-policy']).toContain('sandbox')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['cache-control']).toContain('no-store')
  })

  it('cleans the file name and falls back to a generic type', async () => {
    const id = await newLead('name')
    const res = await upload('sales', id, 'x', { name: '../../etc/passwd\r\n', type: 'not a type' })
    expect(res.status).toBe(201)
    expect(res.body.attachment).toMatchObject({
      name: '.. .. etc passwd',
      mimeType: 'application/octet-stream',
    })
  })

  it('rejects a missing name, an empty file and a body that is not the file', async () => {
    const id = await newLead('bad')
    expect((await upload('sales', id, 'x', { name: '   ' })).status).toBe(400)
    expect((await upload('sales', id, 'x', { name: 'a'.repeat(201) })).status).toBe(400)
    const empty = await upload('sales', id, Buffer.alloc(0))
    expect(empty.status).toBe(400)
    expect(empty.body.error.details).toHaveProperty('file')
    const json = await request(app)
      .post(`/api/leads/${id}/attachments`)
      .query({ name: 'a.json' })
      .set(as('sales'))
      .send({ not: 'a file' })
    expect(json.status).toBe(400)
    expect(await prisma.leadAttachment.count({ where: { leadId: id } })).toBe(0)
  })

  it('refuses files over the size limit', async () => {
    const id = await newLead('big')
    expect((await upload('sales', id, Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 1))).status).toBe(413)
    expect((await upload('sales', id, Buffer.alloc(MAX_ATTACHMENT_BYTES, 1))).status).toBe(201)
  })

  it('limits the number of files on a lead', async () => {
    const id = await newLead('many')
    await prisma.leadAttachment.createMany({
      data: Array.from({ length: MAX_ATTACHMENTS_PER_LEAD }, (_, i) => ({
        leadId: id,
        name: `f${i}`,
        mimeType: 'text/plain',
        sizeBytes: 1,
        data: new Uint8Array([1]),
        uploadedById: salesId,
      })),
    })
    const res = await upload('sales', id, 'one more')
    expect(res.status).toBe(409)
    expect(res.body.error.message).toContain(String(MAX_ATTACHMENTS_PER_LEAD))
  })

  it('404s for a lead that does not exist', async () => {
    expect((await upload('sales', 'missing', 'x')).status).toBe(404)
    expect((await request(app).get('/api/leads/missing/attachments').set(as('sales'))).status).toBe(
      404,
    )
  })
})

describe('the sample files in src/test/fixtures/attachments', () => {
  const dir = new URL('../test/fixtures/attachments/', import.meta.url)
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    txt: 'text/plain',
    csv: 'text/csv',
    html: 'text/html',
  }
  const samples = readdirSync(dir).filter((f) => /\.(pdf|png|txt|csv|html)$/.test(f))

  it('has the samples this test expects', () => {
    expect(samples).toEqual(
      expect.arrayContaining([
        'quote.pdf',
        'logo.png',
        'meeting-notes.txt',
        'pricing.csv',
        'empty.txt',
      ]),
    )
  })

  it.each(samples.filter((f) => f !== 'empty.txt'))(
    'stores %s and returns it unchanged',
    async (f) => {
      const id = await newLead('sample')
      const bytes = readFileSync(new URL(f, dir))
      const up = await upload('sales', id, bytes, { name: f, type: types[f.split('.').pop()!] })
      expect(up.status).toBe(201)
      expect(up.body.attachment).toMatchObject({ name: f, sizeBytes: bytes.length })

      const down = await request(app)
        .get(`/api/leads/${id}/attachments/${up.body.attachment.id}`)
        .set(as('sales'))
        .buffer()
        .parse((res, cb) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => cb(null, Buffer.concat(chunks)))
        })
      expect(Buffer.compare(down.body as Buffer, bytes)).toBe(0)
    },
  )

  it('refuses the empty sample', async () => {
    const id = await newLead('sample-empty')
    const res = await upload('sales', id, readFileSync(new URL('empty.txt', dir)), {
      name: 'empty.txt',
    })
    expect(res.status).toBe(400)
  })
})

describe('removing and finding files', () => {
  it('removes a file, only through its own lead, and only with leads:write', async () => {
    const a = await newLead('rm-a')
    const b = await newLead('rm-b')
    const file = (await upload('sales', a, 'x')).body.attachment.id as string

    const url = (lead: string) => `/api/leads/${lead}/attachments/${file}`
    expect((await request(app).delete(url(a)).set(as('support'))).status).toBe(403)
    // The same file id under another lead is not found, and is not removed.
    expect((await request(app).delete(url(b)).set(as('sales'))).status).toBe(404)
    expect((await request(app).get(url(b)).set(as('sales'))).status).toBe(404)
    expect(await prisma.leadAttachment.count({ where: { id: file } })).toBe(1)

    expect((await request(app).delete(url(a)).set(as('sales'))).status).toBe(204)
    expect(await prisma.leadAttachment.count({ where: { id: file } })).toBe(0)
    expect((await request(app).delete(url(a)).set(as('sales'))).status).toBe(404)
    expect(
      await prisma.auditLog.count({
        where: { action: 'LEAD_ATTACHMENT_REMOVED', entityId: a, userId: salesId },
      }),
    ).toBe(1)
  })

  it('goes with the lead', async () => {
    const id = await newLead('cascade')
    await upload('sales', id, 'x')
    await prisma.lead.delete({ where: { id } })
    expect(await prisma.leadAttachment.count({ where: { leadId: id } })).toBe(0)
  })
})
