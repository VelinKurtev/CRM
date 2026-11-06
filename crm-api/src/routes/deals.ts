import { Router } from 'express'
import { z } from 'zod'

import {
  amount,
  assertCustomer,
  createDealRecord,
  createDealSchema,
  date,
  endOfDay,
  fieldError,
  id,
  probability,
} from '../lib/deal-create.js'
import { outcomeOf } from '../lib/deal-stage.js'
import { HttpError } from '../lib/http-error.js'
import { prisma } from '../lib/prisma.js'
import { requiredText } from '../lib/validation.js'
import { requirePermission } from '../middleware/authorize.js'
import { parseQuery, validateBody } from '../middleware/validate.js'

export const dealsRouter = Router()

const idOf = (req: { params: Record<string, string | string[] | undefined> }) =>
  req.params.id as string

// ───────── Shapes ─────────

/** On update, `null` clears an optional field and leaving it out keeps it as it is. */
const updateDealSchema = z.object({
  title: requiredText('Name').optional(),
  amount: amount.optional(),
  stageId: id('Choose a stage').optional(),
  probability: probability.optional(),
  expectedClose: date.nullable().optional(),
  companyId: id('Choose a company').nullable().optional(),
  contactId: id('Choose a contact').nullable().optional(),
})

const dealSelect = {
  id: true,
  title: true,
  amount: true,
  currency: true,
  status: true,
  probability: true,
  expectedClose: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  pipelineId: true,
  stage: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  owner: { select: { id: true, firstName: true, lastName: true } },
} as const

type Row = Awaited<ReturnType<typeof findOne>>

const findOne = (dealId: string) =>
  prisma.deal.findUnique({ where: { id: dealId }, select: dealSelect })

/** API shape: the value as a plain number. */
const present = ({ amount, ...deal }: NonNullable<Row>) => ({ ...deal, amount: Number(amount) })

/** A deal as the API shows it. */
export const loadDeal = async (dealId: string) => present((await findOne(dealId))!)

// ───────── Board ─────────

/** Each board column shows this many deals, most recently changed first; the count says how many there are. */
export const BOARD_COLUMN_LIMIT = 50

/**
 * One pipeline as a board: every stage in order with how many deals are in it, their total value,
 * and the most recently changed ones. Won and lost deals are in their stages' columns too.
 */
dealsRouter.get('/pipelines/:id/board', requirePermission('deals:read'), async (req, res) => {
  const pipelineId = idOf(req)
  const pipeline = await prisma.pipeline.findUnique({
    where: { id: pipelineId },
    select: {
      id: true,
      name: true,
      stages: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          name: true,
          position: true,
          probability: true,
          isWon: true,
          isLost: true,
        },
      },
    },
  })
  if (!pipeline) throw new HttpError(404, 'Pipeline not found')

  const [totals, columns] = await Promise.all([
    prisma.deal.groupBy({
      by: ['stageId'],
      where: { pipelineId },
      _count: true,
      _sum: { amount: true },
    }),
    Promise.all(
      pipeline.stages.map((stage) =>
        prisma.deal.findMany({
          where: { stageId: stage.id },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          take: BOARD_COLUMN_LIMIT,
          select: dealSelect,
        }),
      ),
    ),
  ])
  const totalOf = new Map(totals.map((t) => [t.stageId, t]))

  res.json({
    pipeline: { id: pipeline.id, name: pipeline.name },
    stages: pipeline.stages.map((stage, i) => ({
      ...stage,
      count: totalOf.get(stage.id)?._count ?? 0,
      value: Number(totalOf.get(stage.id)?._sum.amount ?? 0),
      deals: columns[i].map(present),
    })),
  })
})

// ───────── List ─────────

const listQuery = z.object({
  q: z.string().trim().max(100).default(''),
  status: z.enum(['OPEN', 'WON', 'LOST'], 'Unknown status').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

/** Deals, newest first. Search matches the name or the company's name. */
dealsRouter.get('/deals', requirePermission('deals:read'), async (req, res) => {
  const { q, status, page, pageSize } = parseQuery(listQuery, req.query)
  const where = {
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' as const } },
            { company: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.deal.count({ where }),
    prisma.deal.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: dealSelect,
    }),
  ])
  res.json({ deals: rows.map(present), total, page, pageSize })
})

// ───────── Create, read, update ─────────

dealsRouter.post(
  '/deals',
  requirePermission('deals:write'),
  validateBody(createDealSchema),
  async (req, res) => {
    const dealId = await createDealRecord(
      prisma,
      req.body as z.infer<typeof createDealSchema>,
      req.auth!.userId,
    )
    res.status(201).json({ deal: await loadDeal(dealId) })
  },
)

dealsRouter.get('/deals/:id', requirePermission('deals:read'), async (req, res) => {
  const deal = await findOne(idOf(req))
  if (!deal) throw new HttpError(404, 'Deal not found')
  res.json({ deal: present(deal) })
})

dealsRouter.patch(
  '/deals/:id',
  requirePermission('deals:write'),
  validateBody(updateDealSchema),
  async (req, res) => {
    const dealId = idOf(req)
    const {
      expectedClose,
      stageId,
      probability: wanted,
      ...body
    } = req.body as z.infer<typeof updateDealSchema>
    const current = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { pipelineId: true, stageId: true, stage: true },
    })
    if (!current) throw new HttpError(404, 'Deal not found')
    await assertCustomer(prisma, body.companyId, body.contactId)

    // Moving to another stage decides whether the deal is open, won or lost, and when it closed.
    const moved = stageId !== undefined && stageId !== current.stageId
    let stage = current.stage
    if (moved) {
      const target = await prisma.stage.findUnique({ where: { id: stageId } })
      if (!target || target.pipelineId !== current.pipelineId) {
        throw fieldError('stageId', 'Choose a stage from this deal’s pipeline')
      }
      stage = target
    }
    const outcome = outcomeOf(stage)

    await prisma.deal.update({
      where: { id: dealId },
      data: {
        ...body,
        ...(expectedClose !== undefined
          ? { expectedClose: expectedClose === null ? null : endOfDay(expectedClose) }
          : {}),
        ...(moved ? { stageId: stage.id, status: outcome.status, closedAt: outcome.closedAt } : {}),
        // A closed deal's probability is fixed; otherwise what was asked for, or the new stage's.
        ...(outcome.probability !== null
          ? { probability: outcome.probability }
          : wanted !== undefined
            ? { probability: wanted }
            : moved
              ? { probability: stage.probability }
              : {}),
      },
    })
    res.json({ deal: present((await findOne(dealId))!) })
  },
)
