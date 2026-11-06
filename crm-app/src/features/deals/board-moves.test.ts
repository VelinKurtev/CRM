import { describe, expect, it } from 'vitest'

import type { Board, BoardStage, Deal } from '@/services/deals'
import { applyMove, dropTarget, findDeal } from './board-moves'

const deal = (id: string, stageId: string, amount: number): Deal => ({
  id,
  title: `Deal ${id}`,
  amount,
  currency: 'USD',
  status: 'OPEN',
  probability: 10,
  expectedClose: null,
  closedAt: null,
  pipelineId: 'p',
  stage: { id: stageId, name: stageId },
  company: null,
  contact: null,
  owner: null,
  createdAt: '2026-01-01T00:00:00.000Z',
})

const stage = (id: string, extra: Partial<BoardStage> = {}): BoardStage => ({
  id,
  name: id,
  position: 1,
  probability: 10,
  isWon: false,
  isLost: false,
  count: 0,
  value: 0,
  deals: [],
  ...extra,
})

const board = (): Board => ({
  pipeline: { id: 'p', name: 'Sales' },
  stages: [
    stage('lead', {
      count: 3,
      value: 600,
      deals: [deal('a', 'lead', 100), deal('b', 'lead', 200)],
    }),
    stage('pitch', { probability: 60, count: 1, value: 50, deals: [deal('c', 'pitch', 50)] }),
    stage('won', { isWon: true, probability: 100 }),
    stage('lost', { isLost: true, probability: 0 }),
  ],
})

describe('applyMove', () => {
  it('puts the deal at the top of the new column and adjusts both columns’ counts and totals', () => {
    const next = applyMove(board(), 'a', 'pitch')
    const [lead, pitch] = next.stages
    expect(lead).toMatchObject({ count: 2, value: 500 })
    expect(lead.deals.map((d) => d.id)).toEqual(['b'])
    expect(pitch).toMatchObject({ count: 2, value: 150 })
    expect(pitch.deals.map((d) => d.id)).toEqual(['a', 'c'])
    expect(pitch.deals[0]).toMatchObject({
      stage: { id: 'pitch' },
      status: 'OPEN',
      probability: 60,
    })
  })

  it('does not change the board it was given', () => {
    const before = board()
    applyMove(before, 'a', 'pitch')
    expect(before).toEqual(board())
  })

  it('closes a deal moved to a won or lost column, with a fixed probability', () => {
    const won = applyMove(board(), 'a', 'won').stages[2].deals[0]
    expect(won).toMatchObject({ status: 'WON', probability: 100 })
    expect(won.closedAt).not.toBeNull()
    const lost = applyMove(board(), 'a', 'lost').stages[3].deals[0]
    expect(lost).toMatchObject({ status: 'LOST', probability: 0 })
  })

  it('reopens a closed deal moved back to an open column', () => {
    const closed = applyMove(board(), 'a', 'won')
    const reopened = applyMove(closed, 'a', 'lead').stages[0].deals[0]
    expect(reopened).toMatchObject({ status: 'OPEN', probability: 10, closedAt: null })
  })

  it('leaves the board alone for a move that does nothing', () => {
    const before = board()
    expect(applyMove(before, 'a', 'lead')).toBe(before)
    expect(applyMove(before, 'nope', 'pitch')).toBe(before)
    expect(applyMove(before, 'a', 'nope')).toBe(before)
  })
})

describe('dropTarget', () => {
  it('is the deal and the column it was dropped on', () => {
    expect(dropTarget(board(), { active: { id: 'a' }, over: { id: 'pitch' } })).toEqual({
      dealId: 'a',
      stageId: 'pitch',
    })
  })

  it('is nothing when dropped nowhere, back where it was, or on something that is not a column', () => {
    expect(dropTarget(board(), { active: { id: 'a' }, over: null })).toBeNull()
    expect(dropTarget(board(), { active: { id: 'a' }, over: { id: 'lead' } })).toBeNull()
    expect(dropTarget(board(), { active: { id: 'a' }, over: { id: 'b' } })).toBeNull()
    expect(dropTarget(board(), { active: { id: 'zzz' }, over: { id: 'pitch' } })).toBeNull()
  })
})

describe('findDeal', () => {
  it('finds a deal and its column', () => {
    expect(findDeal(board(), 'c')).toMatchObject({ stage: { id: 'pitch' }, deal: { id: 'c' } })
    expect(findDeal(board(), 'nope')).toBeNull()
  })
})
