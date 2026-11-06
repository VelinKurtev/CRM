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
