import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = {
  sales: `dash-sales-${stamp}@crm.local`,
  support: `dash-support-${stamp}@crm.local`,
}
const tokens = { sales: '', support: '' }
let pipelineId = ''

const get = (who: keyof typeof tokens) =>
  request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${tokens[who]}`)

beforeAll(async () => {
  await syncPermissions(prisma)
  const roles = await prisma.role.findMany()
  const passwordHash = await bcrypt.hash(password, 4)
  for (const [key, role] of [
    ['sales', 'SALES'],
    ['support', 'SUPPORT'],
  ] as const) {
    await prisma.user.create({
      data: {
        email: emails[key],
        passwordHash,
        firstName: key,
        lastName: 'Dash',
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }
  const pipeline = await prisma.pipeline.create({
    data: { name: `dash-${stamp}`, stages: { create: { name: 'Stage', position: 1 } } },
    include: { stages: true },
  })
  pipelineId = pipeline.id
})

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { title: { startsWith: `dash-${stamp}` } } })
  await prisma.deal.deleteMany({ where: { pipelineId } })
  await prisma.pipeline.delete({ where: { id: pipelineId } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.$disconnect()
})

describe('GET /api/dashboard/summary', () => {
  it('requires login', async () => {
    expect((await request(app).get('/api/dashboard/summary')).status).toBe(401)
  })

  it('counts new leads, open deals and this month’s won revenue', async () => {
    const before = (await get('sales')).body
    const stageId = (await prisma.stage.findFirstOrThrow({ where: { pipelineId } })).id
    const deal = (amount: number, status: 'OPEN' | 'WON', closedAt?: Date) => ({
      title: `dash-${stamp}`,
      amount,
      status,
      closedAt,
      pipelineId,
      stageId,
    })
    await prisma.deal.createMany({
      data: [
        deal(1000, 'OPEN'),
        deal(250, 'OPEN'),
        deal(500, 'WON', new Date()),
        deal(700, 'WON', new Date(2000, 0, 1)), // long ago: not this month
      ],
    })
    await prisma.lead.create({ data: { title: `dash-${stamp}-new` } })
    await prisma.lead.create({
      data: { title: `dash-${stamp}-old`, status: 'CONTACTED', createdAt: new Date(2000, 0, 1) },
    })

    const after = (await get('sales')).body
    expect(after.openDeals.count - before.openDeals.count).toBe(2)
    expect(after.openDeals.value - before.openDeals.value).toBe(1250)
    expect(after.sales.wonThisMonth.deals - before.sales.wonThisMonth.deals).toBe(1)
    expect(after.sales.wonThisMonth.revenue - before.sales.wonThisMonth.revenue).toBe(500)
    expect(after.newLeads.last7Days - before.newLeads.last7Days).toBe(1)
    expect(after.newLeads.awaitingContact - before.newLeads.awaitingContact).toBe(1)
  })

  it('hides leads from roles without leads:read but still shows deals', async () => {
    const res = await get('support')
    expect(res.status).toBe(200)
    expect(res.body.newLeads).toBeNull()
    expect(res.body.openDeals).not.toBeNull()
  })
})
