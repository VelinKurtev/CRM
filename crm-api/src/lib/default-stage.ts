import { prisma } from './prisma.js'

/**
 * The stage new deals start in: the first stage of the default pipeline (or of any pipeline).
 * On a fresh database with no pipeline yet, a standard one is created so deals can be added
 * straight away; admins can reshape it later.
 */
export async function firstDealStage() {
  const existing =
    (await prisma.stage.findFirst({
      where: { pipeline: { isDefault: true } },
      orderBy: { position: 'asc' },
    })) ?? (await prisma.stage.findFirst({ orderBy: [{ pipelineId: 'asc' }, { position: 'asc' }] }))
  if (existing) return existing

  const pipeline = await prisma.pipeline.create({
    data: {
      name: 'Sales pipeline',
      isDefault: true,
      stages: {
        create: [
          { name: 'Qualification', position: 1, probability: 10 },
          { name: 'Proposal', position: 2, probability: 40 },
          { name: 'Negotiation', position: 3, probability: 70 },
          { name: 'Closed won', position: 4, probability: 100, isWon: true },
          { name: 'Closed lost', position: 5, probability: 0, isLost: true },
        ],
      },
    },
    include: { stages: { orderBy: { position: 'asc' } } },
  })
  return pipeline.stages[0]
}
