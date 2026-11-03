import { Router } from 'express'

import { HttpError } from '../lib/http-error.js'
import { permissionsOf, userInclude } from '../lib/public-user.js'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/authenticate.js'
import { requirePermission } from '../middleware/authorize.js'

export const dashboardRouter = Router()

const DAY = 24 * 60 * 60 * 1000
const money = (v: { toString(): string } | null | undefined) => Number(v ?? 0)

/**
 * Headline numbers for the dashboard. Each section is `null` when the caller's role can't read
 * that data (e.g. Support has no leads access), so the UI can simply skip it.
 * Amounts are summed as-is; the CRM assumes a single currency for now.
 */
dashboardRouter.get('/dashboard/summary', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: userInclude,
  })
  if (!user || !user.isActive) throw new HttpError(401, 'Invalid or expired token')
  const have = new Set(permissionsOf(user))

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const sales = have.has('deals:read')
    ? await Promise.all([
        prisma.deal.aggregate({
          where: { status: 'WON', closedAt: { gte: monthStart } },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.deal.aggregate({
          where: { status: 'WON', closedAt: { gte: prevMonthStart, lt: monthStart } },
          _sum: { amount: true },
        }),
        prisma.deal.aggregate({
          where: { status: 'OPEN' },
          _sum: { amount: true },
          _count: true,
        }),
      ])
    : null

  const leads = have.has('leads:read')
    ? await Promise.all([
        prisma.lead.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
        prisma.lead.count({ where: { status: 'NEW' } }),
      ])
    : null

  res.json({
    sales: sales && {
      wonThisMonth: { revenue: money(sales[0]._sum.amount), deals: sales[0]._count },
      wonLastMonthRevenue: money(sales[1]._sum.amount),
    },
    newLeads: leads && { last7Days: leads[0], awaitingContact: leads[1] },
    openDeals: sales && { count: sales[2]._count, value: money(sales[2]._sum.amount) },
  })
})

const REVENUE_MONTHS = 12
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/**
 * Revenue won per month for the last 12 months (oldest first, empty months included as 0),
 * so the chart never has gaps. Months follow the same calendar as the summary figures.
 */
dashboardRouter.get('/dashboard/revenue', requirePermission('reports:read'), async (_req, res) => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - (REVENUE_MONTHS - 1), 1)

  const won = await prisma.deal.findMany({
    where: { status: 'WON', closedAt: { gte: start } },
    select: { amount: true, closedAt: true },
  })

  const byMonth = new Map<string, { revenue: number; deals: number }>()
  for (let i = 0; i < REVENUE_MONTHS; i++) {
    byMonth.set(monthKey(new Date(start.getFullYear(), start.getMonth() + i, 1)), {
      revenue: 0,
      deals: 0,
    })
  }
  for (const deal of won) {
    const bucket = byMonth.get(monthKey(deal.closedAt!))
    if (bucket) {
      bucket.revenue += money(deal.amount)
      bucket.deals += 1
    }
  }

  res.json({ months: [...byMonth].map(([month, v]) => ({ month, ...v })) })
})
