import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = { sales: `qc-sales-${stamp}@crm.local`, support: `qc-support-${stamp}@crm.local` }
const tokens = { sales: '', support: '' }
const ids = { sales: '' }

const post = (who: keyof typeof tokens, path: string, body: object) =>
  request(app).post(path).set('Authorization', `Bearer ${tokens[who]}`).send(body)

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
        lastName: 'Qc',
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    if (key === 'sales') ids.sales = u.id
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }
})

afterAll(async () => {
  await prisma.task.deleteMany({ where: { title: { startsWith: `qc-${stamp}` } } })
  await prisma.deal.deleteMany({ where: { title: { startsWith: `qc-${stamp}` } } })
  await prisma.lead.deleteMany({ where: { title: { startsWith: `qc-${stamp}` } } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.$disconnect()
})

describe('quick-create endpoints', () => {
  it('require login', async () => {
    for (const path of ['contacts', 'leads', 'deals', 'tasks']) {
      expect((await request(app).post(`/api/${path}`).send({})).status).toBe(401)
    }
  })

  it('validates input with field errors', async () => {
    const res = await post('sales', '/api/leads', { title: '  ' })
    expect(res.status).toBe(400)
    expect(res.body.error.details).toMatchObject({ title: 'Title is required' })
    expect((await post('sales', '/api/deals', { title: 'x', amount: -5 })).status).toBe(400)
    expect((await post('sales', '/api/tasks', { title: 'x', dueDate: '31/12/2026' })).status).toBe(
      400,
    )
  })

  it('creates a lead as NEW, owned by me', async () => {
    const res = await post('sales', '/api/leads', { title: `qc-${stamp}-lead`, source: 'Web' })
    expect(res.status).toBe(201)
    expect(res.body.lead).toMatchObject({ status: 'NEW', source: 'Web', owner: { id: ids.sales } })
  })

  it('creates an open deal in the first stage of a pipeline', async () => {
    const res = await post('sales', '/api/deals', {
      title: `qc-${stamp}-deal`,
      amount: 1500.5,
      expectedClose: '2027-01-31',
    })
    expect(res.status).toBe(201)
    expect(res.body.deal).toMatchObject({ status: 'OPEN', amount: 1500.5, ownerId: ids.sales })
    const stage = await prisma.stage.findUniqueOrThrow({ where: { id: res.body.deal.stageId } })
    expect(stage.pipelineId).toBe(res.body.deal.pipelineId)
    const first = await prisma.stage.findFirstOrThrow({
      where: { pipelineId: stage.pipelineId },
      orderBy: { position: 'asc' },
    })
    expect(stage.id).toBe(first.id)
  })

  it('creates a task assigned to me, due at the end of the day', async () => {
    const res = await post('sales', '/api/tasks', {
      title: `qc-${stamp}-task`,
      dueDate: '2027-01-31',
    })
    expect(res.status).toBe(201)
    expect(res.body.task).toMatchObject({
      status: 'TODO',
      assigneeId: ids.sales,
      creatorId: ids.sales,
      dueDate: '2027-01-31T23:59:59.999Z',
    })
  })

  it('follows role permissions: support can add tasks but not leads or deals', async () => {
    expect((await post('support', '/api/leads', { title: 'a' })).status).toBe(403)
    expect((await post('support', '/api/deals', { title: 'a' })).status).toBe(403)
    expect((await post('support', '/api/tasks', { title: `qc-${stamp}-support` })).status).toBe(201)
  })
})
