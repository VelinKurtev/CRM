import type { PrismaClient } from '../generated/prisma/client.js'

/** The stages a pipeline starts with unless it is told otherwise. */
export const STANDARD_STAGES = [
  { name: 'Qualification', position: 1, probability: 10, isWon: false, isLost: false },
  { name: 'Proposal', position: 2, probability: 40, isWon: false, isLost: false },
  { name: 'Negotiation', position: 3, probability: 70, isWon: false, isLost: false },
  { name: 'Closed won', position: 4, probability: 100, isWon: true, isLost: false },
  { name: 'Closed lost', position: 5, probability: 0, isWon: false, isLost: true },
]

/**
 * The stage new deals start in: the first stage of the default pipeline (or of any pipeline).
 * If no pipeline exists yet, a standard one is created. Used by the seed and as a safety net
 * so deals can be added on a database that was never seeded; admins can reshape it later.
 */
export async function ensureFirstDealStage(db: Pick<PrismaClient, 'stage' | 'pipeline'>) {
  const existing =
    (await db.stage.findFirst({
      where: { pipeline: { isDefault: true } },
      orderBy: { position: 'asc' },
    })) ?? (await db.stage.findFirst({ orderBy: [{ pipelineId: 'asc' }, { position: 'asc' }] }))
  if (existing) return existing

  const pipeline = await db.pipeline.create({
    data: {
      name: 'Sales pipeline',
      isDefault: true,
      stages: { create: STANDARD_STAGES },
    },
    include: { stages: { orderBy: { position: 'asc' } } },
  })
  return pipeline.stages[0]
}
