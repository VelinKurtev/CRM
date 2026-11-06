import { api } from '@/api/client'

export type DealStatus = 'OPEN' | 'WON' | 'LOST'

type Person = { id: string; firstName: string; lastName: string }

export type Deal = {
  id: string
  title: string
  /** The deal's value, in USD. */
  amount: number
  currency: string
  status: DealStatus
  /** 0 to 100. */
  probability: number
  /** An ISO date-time at the end of the chosen day (UTC). */
  expectedClose: string | null
  closedAt: string | null
  pipelineId: string
  stage: { id: string; name: string }
  company: { id: string; name: string } | null
  contact: { id: string; firstName: string; lastName: string } | null
  owner: Person | null
  createdAt: string
}

export type NewDeal = {
  title: string
  amount?: number
  stageId?: string
  probability?: number
  /** A calendar date, `YYYY-MM-DD`. */
  expectedClose?: string
  companyId?: string
  contactId?: string
}

/** On update, `null` clears an optional field and a missing field is left alone. */
export type DealUpdate = {
  title: string
  amount: number
  stageId: string
  probability: number
  expectedClose: string | null
  companyId: string | null
  contactId: string | null
}

export type DealsPage = { deals: Deal[]; total: number; page: number; pageSize: number }

export type PipelineStage = {
  id: string
  name: string
  position: number
  probability: number
  isWon: boolean
  isLost: boolean
}

export type Pipeline = { id: string; name: string; isDefault: boolean; stages: PipelineStage[] }

export const listDeals = (params: {
  q?: string
  status?: string
  page?: number
  pageSize?: number
}) => api.get<DealsPage>('/deals', { params }).then((r) => r.data)

export const getDeal = (id: string) =>
  api.get<{ deal: Deal }>(`/deals/${id}`).then((r) => r.data.deal)

export const createDeal = (body: NewDeal) =>
  api.post<{ deal: Deal }>('/deals', body).then((r) => r.data.deal)

export const updateDeal = (id: string, body: DealUpdate) =>
  api.patch<{ deal: Deal }>(`/deals/${id}`, body).then((r) => r.data.deal)

/** The default pipeline first, each with its stages in order. */
export const listPipelines = () =>
  api.get<{ pipelines: Pipeline[] }>('/pipelines').then((r) => r.data.pipelines)

/** One column of the board: a stage, how many deals are in it in all, and the newest few. */
export type BoardStage = PipelineStage & {
  /** Deals in the stage, in all. `deals` may hold fewer. */
  count: number
  /** Their total value. */
  value: number
  deals: Deal[]
}

export type Board = { pipeline: { id: string; name: string }; stages: BoardStage[] }

export const getBoard = (pipelineId: string) =>
  api.get<Board>(`/pipelines/${pipelineId}/board`).then((r) => r.data)

/** Move a deal to another stage of its pipeline, which also opens or closes it. */
export const moveDeal = (id: string, stageId: string) =>
  api.patch<{ deal: Deal }>(`/deals/${id}`, { stageId }).then((r) => r.data.deal)
