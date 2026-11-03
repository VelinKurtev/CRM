import { Router } from 'express'
import { z } from 'zod'

import { ensureFirstDealStage } from '../lib/default-pipeline.js'
import { prisma } from '../lib/prisma.js'
import { requirePermission } from '../middleware/authorize.js'
import { validateBody } from '../middleware/validate.js'

/**
 * Minimal "create" endpoints behind the dashboard quick actions. Each takes only the essentials;
 * the full create/edit forms for each record type build on these.
 */
export const quickCreateRouter = Router()

const text = (label: string, max = 200) => z.string().trim().min(1, `${label} is required`).max(max)
const optionalText = (max = 200) => z.string().trim().max(max).optional()
/** A calendar date from a date input; tasks are due at the end of that day. */
const endOfDay = (d: string) => new Date(`${d}T23:59:59.999Z`)

const leadSchema = z.object({ title: text('Title'), source: optionalText(100) })

quickCreateRouter.post(
  '/leads',
  requirePermission('leads:write'),
  validateBody(leadSchema),
  async (req, res) => {
    const data = req.body as z.infer<typeof leadSchema>
    const lead = await prisma.lead.create({ data: { ...data, ownerId: req.auth!.userId } })
    res.status(201).json({ lead })
  },
)

const dealSchema = z.object({
  title: text('Title'),
  amount: z.number().min(0, 'Amount cannot be negative').max(999_999_999_999).optional(),
  expectedClose: z.iso.date('Enter a valid date').optional(),
})

quickCreateRouter.post(
  '/deals',
  requirePermission('deals:write'),
  validateBody(dealSchema),
  async (req, res) => {
    const { expectedClose, ...data } = req.body as z.infer<typeof dealSchema>
    const stage = await ensureFirstDealStage(prisma)
    const deal = await prisma.deal.create({
      data: {
        ...data,
        expectedClose: expectedClose ? endOfDay(expectedClose) : undefined,
        pipelineId: stage.pipelineId,
        stageId: stage.id,
        ownerId: req.auth!.userId,
      },
    })
    res.status(201).json({ deal: { ...deal, amount: Number(deal.amount) } })
  },
)

const taskSchema = z.object({
  title: text('Title'),
  dueDate: z.iso.date('Enter a valid date').optional(),
})

quickCreateRouter.post(
  '/tasks',
  requirePermission('tasks:write'),
  validateBody(taskSchema),
  async (req, res) => {
    const { dueDate, ...data } = req.body as z.infer<typeof taskSchema>
    const task = await prisma.task.create({
      data: {
        ...data,
        dueDate: dueDate ? endOfDay(dueDate) : undefined,
        creatorId: req.auth!.userId,
        assigneeId: req.auth!.userId,
      },
    })
    res.status(201).json({ task })
  },
)
