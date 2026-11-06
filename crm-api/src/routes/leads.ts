import { Router } from 'express'
import { z } from 'zod'

import { HttpError } from '../lib/http-error.js'
import { prisma } from '../lib/prisma.js'
import { optionalText, requiredText } from '../lib/validation.js'
import { requirePermission } from '../middleware/authorize.js'
import { parseQuery, validateBody } from '../middleware/validate.js'

export const leadsRouter = Router()

const idOf = (req: { params: Record<string, string | string[] | undefined> }) =>
  req.params.id as string

// ───────── Shapes ─────────

const value = z
  .number('Value must be a number')
  .min(0, 'Value cannot be negative')
  .max(999_999_999_999, 'That value is too large')
  .refine((v) => Math.round(v * 100) / 100 === v, 'Use at most two decimal places')
const priority = z.enum(['LOW', 'MEDIUM', 'HIGH'], 'Priority must be LOW, MEDIUM or HIGH')
const STAGES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const
const status = z.enum(STAGES, 'Unknown status')
const notes = z.string().trim().max(5000, 'Keep notes under 5000 characters')
const ownerId = z.string().min(1, 'Choose an owner')

const createLeadSchema = z.object({
  title: requiredText('Title'),
  source: optionalText(100),
  value: value.optional(),
  priority: priority.optional(),
  status: status.optional(),
  notes: notes.optional(),
  ownerId: ownerId.optional(),
})

/** On update, `null` clears an optional field and leaving it out keeps it as it is. */
const updateLeadSchema = z.object({
  title: requiredText('Title').optional(),
  source: requiredText('Source', 100).nullable().optional(),
  value: value.nullable().optional(),
  priority: priority.optional(),
  status: status.optional(),
  notes: notes.nullable().optional(),
  ownerId: ownerId.nullable().optional(),
})

const leadSelect = {
  id: true,
  title: true,
  source: true,
  value: true,
  priority: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { attachments: true } },
} as const

type Row = Awaited<ReturnType<typeof findOne>>

const findOne = (id: string) => prisma.lead.findUnique({ where: { id }, select: leadSelect })

/** API shape: value as a plain number, the attachment count flattened. */
const present = ({ value, _count, ...lead }: NonNullable<Row>) => ({
  ...lead,
  value: value === null ? null : Number(value),
  attachmentCount: _count.attachments,
})

/** A lead's owner must be an active user. */
async function assertOwnerActive(ownerId: string | null | undefined) {
  if (!ownerId) return
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { isActive: true } })
  if (!owner?.isActive) {
    throw new HttpError(400, 'Choose an active user as owner', {
      ownerId: 'Choose an active user as owner',
    })
  }
}

// ───────── List ─────────

const listQuery = z.object({
  q: z.string().trim().max(100).default(''),
  status: status.optional(),
  priority: priority.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

/** Leads, newest first, for the leads page. */
leadsRouter.get('/leads', requirePermission('leads:read'), async (req, res) => {
  const { q, status, priority, page, pageSize } = parseQuery(listQuery, req.query)
  const where = {
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' as const } },
            { source: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
  }
  // How many leads are in each stage under the search and priority, whatever stage is chosen.
  const { status: _stage, ...withoutStage } = where
  const [total, stageGroups, rows] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.groupBy({ by: ['status'], where: withoutStage, _count: true }),
    prisma.lead.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: leadSelect,
    }),
  ])
  const stageCounts = Object.fromEntries(STAGES.map((st) => [st, 0]))
  for (const g of stageGroups) stageCounts[g.status] = g._count
  res.json({ leads: rows.map(present), total, page, pageSize, stageCounts })
})

/** Active users a lead can be given to, for the owner choice on the form. */
leadsRouter.get('/leads/owners', requirePermission('leads:write'), async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
    select: { id: true, firstName: true, lastName: true },
  })
  res.json({ owners: users })
})

// ───────── Create, read, update ─────────

leadsRouter.post(
  '/leads',
  requirePermission('leads:write'),
  validateBody(createLeadSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof createLeadSchema>
    await assertOwnerActive(body.ownerId)
    const created = await prisma.lead.create({
      data: { ...body, notes: body.notes || undefined, ownerId: body.ownerId ?? req.auth!.userId },
      select: { id: true },
    })
    res.status(201).json({ lead: present((await findOne(created.id))!) })
  },
)

leadsRouter.get('/leads/:id', requirePermission('leads:read'), async (req, res) => {
  const lead = await findOne(idOf(req))
  if (!lead) throw new HttpError(404, 'Lead not found')
  res.json({ lead: present(lead) })
})

leadsRouter.patch(
  '/leads/:id',
  requirePermission('leads:write'),
  validateBody(updateLeadSchema),
  async (req, res) => {
    const id = idOf(req)
    const body = req.body as z.infer<typeof updateLeadSchema>
    if (!(await prisma.lead.findUnique({ where: { id }, select: { id: true } }))) {
      throw new HttpError(404, 'Lead not found')
    }
    await assertOwnerActive(body.ownerId)
    await prisma.lead.update({
      where: { id },
      data: { ...body, notes: body.notes === '' ? null : body.notes },
    })
    res.json({ lead: present((await findOne(id))!) })
  },
)
