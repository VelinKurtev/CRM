import { Router } from 'express'
import { z } from 'zod'

import { audit } from '../lib/audit.js'
import { ensureFirstDealStage, STANDARD_STAGES } from '../lib/default-pipeline.js'
import { outcomeOf } from '../lib/deal-stage.js'
import { HttpError } from '../lib/http-error.js'
import {
  flagsOf,
  kindOf,
  listPipelineViews,
  loadPipelineView,
  stageOrderProblem,
  type StageKind,
} from '../lib/pipelines.js'
import { prisma } from '../lib/prisma.js'
import { requiredText } from '../lib/validation.js'
import { requirePermission } from '../middleware/authorize.js'
import { validateBody } from '../middleware/validate.js'

export const pipelinesRouter = Router()

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
const param = (req: { params: Record<string, string | string[] | undefined> }, key: string) =>
  req.params[key] as string

const manage = requirePermission('settings:manage')

// ───────── Shapes ─────────

const name = requiredText('Name', 100)
const probability = z
  .number('Probability must be a number')
  .int('Probability must be a whole number')
  .min(0, 'Probability cannot be below 0')
  .max(100, 'Probability cannot be above 100')
const kind = z.enum(['open', 'won', 'lost'], 'Choose open, won or lost')

const createPipelineSchema = z.object({ name })
const updatePipelineSchema = z.object({
  name: name.optional(),
  /** Only `true`: a pipeline stops being the default when another one becomes it. */
  isDefault: z.literal(true, 'Make another pipeline the default instead').optional(),
})
const createStageSchema = z.object({
  name,
  probability: probability.optional(),
  kind: kind.default('open'),
  /** Where it goes, counting from 1. Open stages go before the closed ones unless told. */
  position: z.number().int().min(1).optional(),
})
const updateStageSchema = z.object({
  name: name.optional(),
  probability: probability.optional(),
  kind: kind.optional(),
})
const orderSchema = z.object({ stageIds: z.array(z.string().min(1)).min(1) })

const fieldError = (status: number, field: string, message: string) =>
  new HttpError(status, message, { [field]: message })

// ───────── Helpers ─────────

async function log(
  req: { auth?: { userId: string }; ip?: string },
  action: string,
  pipelineId: string,
  changes: Record<string, string | number | boolean | null> = {},
) {
  await audit({
    action,
    userId: req.auth!.userId,
    entityType: 'Pipeline',
    entityId: pipelineId,
    changes,
    ip: req.ip,
  })
}

async function assertPipelineNameFree(db: Tx | typeof prisma, value: string, exceptId?: string) {
  const clash = await db.pipeline.findFirst({
    where: {
      name: { equals: value, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  })
  if (clash) throw fieldError(409, 'name', 'A pipeline with this name already exists')
}

async function assertStageNameFree(
  db: Tx | typeof prisma,
  pipelineId: string,
  value: string,
  exceptId?: string,
) {
  const clash = await db.stage.findFirst({
    where: {
      pipelineId,
      name: { equals: value, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  })
  if (clash) throw fieldError(409, 'name', 'This pipeline already has a stage with this name')
}

/**
 * Number the stages 1, 2, 3… in the order given. Positions are unique per pipeline, so they are
 * first moved out of the way and then set.
 */
async function renumber(tx: Tx, orderedIds: string[]) {
  for (const [i, stageId] of orderedIds.entries()) {
    await tx.stage.update({ where: { id: stageId }, data: { position: 100_000 + i } })
  }
  for (const [i, stageId] of orderedIds.entries()) {
    await tx.stage.update({ where: { id: stageId }, data: { position: i + 1 } })
  }
}

/** The deals in a stage take on what the stage now means: open, won or lost. */
async function syncDealsToStage(
  tx: Tx,
  stage: { id: string; probability: number; isWon: boolean; isLost: boolean },
) {
  const outcome = outcomeOf(stage)
  const probability = outcome.probability ?? stage.probability
  if (outcome.status === 'OPEN') {
    await tx.deal.updateMany({
      where: { stageId: stage.id },
      data: { status: 'OPEN', closedAt: null, probability },
    })
    return
  }
  await tx.deal.updateMany({
    where: { stageId: stage.id },
    data: { status: outcome.status, probability },
  })
  // Deals that were already closed keep the day they closed.
  await tx.deal.updateMany({
    where: { stageId: stage.id, closedAt: null },
    data: { closedAt: outcome.closedAt },
  })
}

const orderedStages = (tx: Tx, pipelineId: string) =>
  tx.stage.findMany({ where: { pipelineId }, orderBy: { position: 'asc' } })

// ───────── Pipelines ─────────

/** Pipelines with their stages in order, the default one first, and how many deals are in each. */
pipelinesRouter.get('/pipelines', requirePermission('deals:read'), async (_req, res) => {
  // A database with no pipeline yet gets the standard one, the same as when the first deal is added.
  await ensureFirstDealStage(prisma)
  res.json({ pipelines: await listPipelineViews(prisma) })
})

pipelinesRouter.post('/pipelines', manage, validateBody(createPipelineSchema), async (req, res) => {
  const body = req.body as z.infer<typeof createPipelineSchema>
  await assertPipelineNameFree(prisma, body.name)
  const created = await prisma.pipeline.create({
    data: { name: body.name, stages: { create: STANDARD_STAGES } },
    select: { id: true },
  })
  await log(req, 'PIPELINE_CREATED', created.id, { name: body.name })
  res.status(201).json({ pipeline: await loadPipelineView(prisma, created.id) })
})

pipelinesRouter.patch(
  '/pipelines/:id',
  manage,
  validateBody(updatePipelineSchema),
  async (req, res) => {
    const id = param(req, 'id')
    const body = req.body as z.infer<typeof updatePipelineSchema>
    const current = await prisma.pipeline.findUnique({ where: { id } })
    if (!current) throw new HttpError(404, 'Pipeline not found')
    if (body.name !== undefined) await assertPipelineNameFree(prisma, body.name, id)

    await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.pipeline.updateMany({ where: { id: { not: id } }, data: { isDefault: false } })
      }
      await tx.pipeline.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.isDefault ? { isDefault: true } : {}),
        },
      })
    })
    if (body.name !== undefined && body.name !== current.name) {
      await log(req, 'PIPELINE_RENAMED', id, { from: current.name, to: body.name })
    }
    if (body.isDefault && !current.isDefault) await log(req, 'PIPELINE_DEFAULT_SET', id)
    res.json({ pipeline: await loadPipelineView(prisma, id) })
  },
)

pipelinesRouter.delete('/pipelines/:id', manage, async (req, res) => {
  const id = param(req, 'id')
  const pipeline = await prisma.pipeline.findUnique({
    where: { id },
    select: { name: true, isDefault: true, _count: { select: { deals: true } } },
  })
  if (!pipeline) throw new HttpError(404, 'Pipeline not found')
  if (pipeline.isDefault) {
    throw new HttpError(409, 'This is the default pipeline: make another one the default first')
  }
  if (pipeline._count.deals > 0) {
    throw new HttpError(
      409,
      `${pipeline._count.deals} ${pipeline._count.deals === 1 ? 'deal is' : 'deals are'} in this pipeline: delete them or finish with them first`,
    )
  }
  await prisma.pipeline.delete({ where: { id } })
  await log(req, 'PIPELINE_DELETED', id, { name: pipeline.name })
  res.status(204).end()
})

// ───────── Stages ─────────

pipelinesRouter.post(
  '/pipelines/:id/stages',
  manage,
  validateBody(createStageSchema),
  async (req, res) => {
    const pipelineId = param(req, 'id')
    const body = req.body as z.infer<typeof createStageSchema>
    if (!(await prisma.pipeline.findUnique({ where: { id: pipelineId } }))) {
      throw new HttpError(404, 'Pipeline not found')
    }
    await assertStageNameFree(prisma, pipelineId, body.name)

    const created = await prisma.$transaction(async (tx) => {
      const existing = await orderedStages(tx, pipelineId)
      // An open stage goes before the closed ones at the end, a closed stage goes last.
      const firstClosed = existing.findIndex((s) => s.isWon || s.isLost)
      const index =
        body.position !== undefined
          ? Math.min(body.position - 1, existing.length)
          : body.kind === 'open' && firstClosed >= 0
            ? firstClosed
            : existing.length

      const stage = await tx.stage.create({
        data: {
          pipelineId,
          name: body.name,
          position: 200_000,
          probability:
            body.kind === 'won' ? 100 : body.kind === 'lost' ? 0 : (body.probability ?? 0),
          ...flagsOf(body.kind),
        },
      })
      const order = [...existing]
      order.splice(index, 0, stage)
      const problem = stageOrderProblem(order)
      if (problem) throw fieldError(400, 'kind', problem)
      await renumber(
        tx,
        order.map((s) => s.id),
      )
      return stage
    })
    await log(req, 'STAGE_ADDED', pipelineId, { stage: created.name })
    res.status(201).json({ pipeline: await loadPipelineView(prisma, pipelineId) })
  },
)

pipelinesRouter.patch(
  '/pipelines/:id/stages/:stageId',
  manage,
  validateBody(updateStageSchema),
  async (req, res) => {
    const pipelineId = param(req, 'id')
    const stageId = param(req, 'stageId')
    const body = req.body as z.infer<typeof updateStageSchema>
    const stage = await prisma.stage.findFirst({ where: { id: stageId, pipelineId } })
    if (!stage) throw new HttpError(404, 'Stage not found')
    if (body.name !== undefined) await assertStageNameFree(prisma, pipelineId, body.name, stageId)

    const wasKind = kindOf(stage)
    const nowKind: StageKind = body.kind ?? wasKind
    const kindChanged = nowKind !== wasKind
    // A closed stage's probability is fixed; one that has just been reopened needs its own.
    const nowProbability =
      nowKind === 'won'
        ? 100
        : nowKind === 'lost'
          ? 0
          : (body.probability ?? (wasKind === 'open' ? stage.probability : 50))

    await prisma.$transaction(async (tx) => {
      if (kindChanged) {
        const order = (await orderedStages(tx, pipelineId)).map((s) =>
          s.id === stageId ? { ...s, ...flagsOf(nowKind) } : s,
        )
        const problem = stageOrderProblem(order)
        if (problem) throw fieldError(400, 'kind', problem)
      }
      const updated = await tx.stage.update({
        where: { id: stageId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          probability: nowProbability,
          ...flagsOf(nowKind),
        },
      })
      // Deals already in the stage follow what it now means.
      if (kindChanged) await syncDealsToStage(tx, updated)
    })
    await log(req, 'STAGE_UPDATED', pipelineId, {
      stage: body.name ?? stage.name,
      kind: nowKind,
      probability: nowProbability,
    })
    res.json({ pipeline: await loadPipelineView(prisma, pipelineId) })
  },
)

/** Put the stages in a new order: send every stage's id, in the order they should be in. */
pipelinesRouter.put(
  '/pipelines/:id/stages/order',
  manage,
  validateBody(orderSchema),
  async (req, res) => {
    const pipelineId = param(req, 'id')
    const { stageIds } = req.body as z.infer<typeof orderSchema>
    if (!(await prisma.pipeline.findUnique({ where: { id: pipelineId } }))) {
      throw new HttpError(404, 'Pipeline not found')
    }
    await prisma.$transaction(async (tx) => {
      const existing = await orderedStages(tx, pipelineId)
      const wanted = new Set(stageIds)
      if (
        wanted.size !== stageIds.length ||
        existing.length !== stageIds.length ||
        !existing.every((s) => wanted.has(s.id))
      ) {
        throw fieldError(400, 'stageIds', 'List every stage of the pipeline exactly once')
      }
      const byId = new Map(existing.map((s) => [s.id, s]))
      const problem = stageOrderProblem(stageIds.map((sid) => byId.get(sid)!))
      if (problem) throw fieldError(400, 'stageIds', problem)
      await renumber(tx, stageIds)
    })
    await log(req, 'STAGES_REORDERED', pipelineId)
    res.json({ pipeline: await loadPipelineView(prisma, pipelineId) })
  },
)

const deleteStageQuery = z.object({ moveDealsTo: z.string().min(1).optional() })

/**
 * Remove a stage. If it holds deals, `?moveDealsTo=` says which stage of the same pipeline they go
 * to; they take on what that stage means (open, won or lost).
 */
pipelinesRouter.delete('/pipelines/:id/stages/:stageId', manage, async (req, res) => {
  const pipelineId = param(req, 'id')
  const stageId = param(req, 'stageId')
  const { moveDealsTo } = deleteStageQuery.parse(req.query)
  const stage = await prisma.stage.findFirst({ where: { id: stageId, pipelineId } })
  if (!stage) throw new HttpError(404, 'Stage not found')

  await prisma.$transaction(async (tx) => {
    const rest = (await orderedStages(tx, pipelineId)).filter((s) => s.id !== stageId)
    const problem = stageOrderProblem(rest)
    if (problem) throw new HttpError(409, problem)

    const dealCount = await tx.deal.count({ where: { stageId } })
    if (dealCount > 0) {
      const target = rest.find((s) => s.id === moveDealsTo)
      if (!moveDealsTo) {
        throw fieldError(
          409,
          'moveDealsTo',
          `${dealCount} ${dealCount === 1 ? 'deal is' : 'deals are'} in this stage: choose where to move them`,
        )
      }
      if (!target) throw fieldError(400, 'moveDealsTo', 'Choose another stage of this pipeline')
      const outcome = outcomeOf(target)
      await tx.deal.updateMany({
        where: { stageId },
        data: {
          stageId: target.id,
          status: outcome.status,
          closedAt: outcome.closedAt,
          probability: outcome.probability ?? target.probability,
        },
      })
    }
    await tx.stage.delete({ where: { id: stageId } })
    await renumber(
      tx,
      rest.map((s) => s.id),
    )
  })
  await log(req, 'STAGE_DELETED', pipelineId, { stage: stage.name })
  res.status(204).end()
})
