import type { PrismaClient } from '../generated/prisma/client.js'

type Db = Pick<PrismaClient, 'pipeline'>

export type StageKind = 'open' | 'won' | 'lost'

export const kindOf = (s: { isWon: boolean; isLost: boolean }): StageKind =>
  s.isWon ? 'won' : s.isLost ? 'lost' : 'open'

export const flagsOf = (kind: StageKind) => ({ isWon: kind === 'won', isLost: kind === 'lost' })

/** The stage a new deal starts in is the first one, so it has to be an open stage. */
export const FIRST_STAGE_MUST_BE_OPEN =
  'The first stage must stay open: new deals start there. Put an open stage first.'

/** What a pipeline needs to be usable: a stage, and an open one first. */
export function stageOrderProblem(stages: { isWon: boolean; isLost: boolean }[]) {
  if (stages.length === 0) return 'A pipeline needs at least one stage'
  if (stages[0].isWon || stages[0].isLost) return FIRST_STAGE_MUST_BE_OPEN
  return null
}

const pipelineSelect = {
  id: true,
  name: true,
  isDefault: true,
  stages: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      name: true,
      position: true,
      probability: true,
      isWon: true,
      isLost: true,
      _count: { select: { deals: true } },
    },
  },
} as const

/** API shape: how many deals each stage holds, and the pipeline in all. */
const present = <T extends { stages: { _count: { deals: number } }[] }>({ stages, ...p }: T) => ({
  ...p,
  dealCount: stages.reduce((n, s) => n + s._count.deals, 0),
  stages: stages.map(({ _count, ...s }) => ({ ...s, dealCount: _count.deals })),
})

/** Every pipeline with its stages in order, the default one first. */
export async function listPipelineViews(db: Db) {
  const rows = await db.pipeline.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: pipelineSelect,
  })
  return rows.map(present)
}

export async function loadPipelineView(db: Db, id: string) {
  const row = await db.pipeline.findUnique({ where: { id }, select: pipelineSelect })
  return row && present(row)
}
