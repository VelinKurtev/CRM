import type { Board, BoardStage, Deal } from '@/services/deals'

/** Where a deal sits on the board, or `null` if it is not on it (a column shows only its newest). */
export function findDeal(board: Board, dealId: string) {
  for (const stage of board.stages) {
    const deal = stage.deals.find((d) => d.id === dealId)
    if (deal) return { deal, stage }
  }
  return null
}

/** What a stage makes of a deal that is moved into it, as the server will. */
function inStage(deal: Deal, stage: BoardStage): Deal {
  return {
    ...deal,
    stage: { id: stage.id, name: stage.name },
    status: stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN',
    probability: stage.isWon ? 100 : stage.isLost ? 0 : stage.probability,
    closedAt: stage.isWon || stage.isLost ? (deal.closedAt ?? new Date().toISOString()) : null,
  }
}

/**
 * The board with a deal moved to the top of another column, with both columns' counts and totals
 * adjusted. Used to show the move at once, before the server has confirmed it. A move that does
 * nothing (same column, or an unknown deal or stage) returns the board unchanged.
 */
export function applyMove(board: Board, dealId: string, toStageId: string): Board {
  const found = findDeal(board, dealId)
  const target = board.stages.find((s) => s.id === toStageId)
  if (!found || !target || found.stage.id === toStageId) return board

  const moved = inStage(found.deal, target)
  return {
    ...board,
    stages: board.stages.map((stage) => {
      if (stage.id === found.stage.id) {
        return {
          ...stage,
          count: stage.count - 1,
          value: stage.value - found.deal.amount,
          deals: stage.deals.filter((d) => d.id !== dealId),
        }
      }
      if (stage.id === toStageId) {
        return {
          ...stage,
          count: stage.count + 1,
          value: stage.value + found.deal.amount,
          deals: [moved, ...stage.deals],
        }
      }
      return stage
    }),
  }
}

/** The move a finished drag asks for: dropped on a column other than the one it came from. */
export function dropTarget(
  board: Board,
  event: { active: { id: string | number }; over: { id: string | number } | null },
): { dealId: string; stageId: string } | null {
  if (!event.over) return null
  const dealId = String(event.active.id)
  const stageId = String(event.over.id)
  const found = findDeal(board, dealId)
  if (!found || found.stage.id === stageId) return null
  if (!board.stages.some((s) => s.id === stageId)) return null
  return { dealId, stageId }
}
