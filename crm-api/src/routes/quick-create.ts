import { Router } from 'express'
import { z } from 'zod'

import { prisma } from '../lib/prisma.js'
import { requirePermission } from '../middleware/authorize.js'
import { validateBody } from '../middleware/validate.js'

/**
 * Minimal "create" endpoints behind the dashboard quick actions. Each takes only the essentials;
 * the full create/edit forms for each record type build on these.
 */
export const quickCreateRouter = Router()

const text = (label: string, max = 200) => z.string().trim().min(1, `${label} is required`).max(max)
/** A calendar date from a date input; tasks are due at the end of that day. */
const endOfDay = (d: string) => new Date(`${d}T23:59:59.999Z`)

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
