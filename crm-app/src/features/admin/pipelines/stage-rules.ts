import type { ManagedStage, StageKind } from '@/services/pipelines'

export const KIND_LABELS: Record<StageKind, string> = {
  open: 'Open',
  won: 'Won',
  lost: 'Lost',
}

export const kindOf = (s: { isWon: boolean; isLost: boolean }): StageKind =>
  s.isWon ? 'won' : s.isLost ? 'lost' : 'open'

/** New deals start in the first stage, so it has to be an open one. */
const firstIsOpen = (stages: { isWon: boolean; isLost: boolean }[]) =>
  stages.length > 0 && !stages[0].isWon && !stages[0].isLost

/** Whether a stage can swap places with its neighbour without a closed stage ending up first. */
export function canMove(stages: ManagedStage[], index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= stages.length) return false
  const next = [...stages]
  ;[next[index], next[target]] = [next[target], next[index]]
  return firstIsOpen(next)
}

/** The stage ids with one stage swapped with its neighbour. */
export function moved(stages: ManagedStage[], index: number, direction: -1 | 1) {
  const ids = stages.map((s) => s.id)
  ;[ids[index], ids[index + direction]] = [ids[index + direction], ids[index]]
  return ids
}
