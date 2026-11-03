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
  manager: `dash-manager-${stamp}@crm.local`,
}
const tokens = { sales: '', support: '', manager: '' }
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
    ['manager', 'MANAGER'],
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

describe('GET /api/dashboard/revenue', () => {
  const revenue = (who: keyof typeof tokens) =>
    request(app).get('/api/dashboard/revenue').set('Authorization', `Bearer ${tokens[who]}`)

  it('is for roles with reports:read only', async () => {
    expect((await request(app).get('/api/dashboard/revenue')).status).toBe(401)
    expect((await revenue('sales')).status).toBe(403)
    expect((await revenue('manager')).status).toBe(200)
  })

  it('returns 12 months, oldest first, with revenue in the right month', async () => {
    const stageId = (await prisma.stage.findFirstOrThrow({ where: { pipelineId } })).id
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    const before = (await revenue('manager')).body.months
    await prisma.deal.createMany({
      data: [
        {
          title: `dash-${stamp}`,
          amount: 800,
          status: 'WON',
          closedAt: lastMonth,
          pipelineId,
          stageId,
        },
        {
          title: `dash-${stamp}`,
          amount: 200,
          status: 'WON',
          closedAt: lastMonth,
          pipelineId,
          stageId,
        },
      ],
    })

    const { months } = (await revenue('manager')).body
    expect(months).toHaveLength(12)
    expect(months.map((m: { month: string }) => m.month)).toEqual(
      [...months.map((m: { month: string }) => m.month)].sort(),
    )
    const key = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`
    const pick = (list: { month: string; revenue: number; deals: number }[]) =>
      list.find((m) => m.month === key)!
    expect(pick(months).revenue - pick(before).revenue).toBe(1000)
    expect(pick(months).deals - pick(before).deals).toBe(2)
  })
})
