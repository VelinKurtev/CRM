/** What being in a stage means for a deal: still open, or closed won or lost. */
type StageKind = { isWon: boolean; isLost: boolean; probability: number }

export type DealOutcome = {
  status: 'OPEN' | 'WON' | 'LOST'
  /** When it closed; `null` while it is open. */
  closedAt: Date | null
  /** Won is certain and lost is not going to happen, whatever the stage's default says. */
  probability: number | null
}

/**
 * The status and closing time a deal gets from the stage it is moved into. Reopening a closed deal
 * clears `closedAt`. `probability` is only forced for closed deals; for an open one the caller
 * decides (usually the stage's own probability).
 */
export function outcomeOf(stage: StageKind, now = new Date()): DealOutcome {
  if (stage.isWon) return { status: 'WON', closedAt: now, probability: 100 }
  if (stage.isLost) return { status: 'LOST', closedAt: now, probability: 0 }
  return { status: 'OPEN', closedAt: null, probability: null }
}
