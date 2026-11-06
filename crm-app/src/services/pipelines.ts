import { api } from '@/api/client'
import type { PipelineStage } from './deals'

export type StageKind = 'open' | 'won' | 'lost'

export type ManagedStage = PipelineStage & {
  /** Deals in this stage. */
  dealCount: number
}

export type ManagedPipeline = {
  id: string
  name: string
  isDefault: boolean
  /** Deals in the pipeline, in all. */
  dealCount: number
  stages: ManagedStage[]
}

export type StageInput = {
  name: string
  kind: StageKind
  /** Ignored for won (100) and lost (0) stages. */
  probability?: number
}

const one = (r: { data: { pipeline: ManagedPipeline } }) => r.data.pipeline

export const listManagedPipelines = () =>
  api.get<{ pipelines: ManagedPipeline[] }>('/pipelines').then((r) => r.data.pipelines)

export const createPipeline = (name: string) =>
  api.post<{ pipeline: ManagedPipeline }>('/pipelines', { name }).then(one)

export const renamePipeline = (id: string, name: string) =>
  api.patch<{ pipeline: ManagedPipeline }>(`/pipelines/${id}`, { name }).then(one)

export const makeDefaultPipeline = (id: string) =>
  api.patch<{ pipeline: ManagedPipeline }>(`/pipelines/${id}`, { isDefault: true }).then(one)

export const deletePipeline = (id: string) => api.delete(`/pipelines/${id}`).then(() => undefined)

export const addStage = (pipelineId: string, body: StageInput) =>
  api.post<{ pipeline: ManagedPipeline }>(`/pipelines/${pipelineId}/stages`, body).then(one)

export const updateStage = (pipelineId: string, stageId: string, body: StageInput) =>
  api
    .patch<{ pipeline: ManagedPipeline }>(`/pipelines/${pipelineId}/stages/${stageId}`, body)
    .then(one)

/** Every stage's id, in the order they should be in. */
export const reorderStages = (pipelineId: string, stageIds: string[]) =>
  api
    .put<{ pipeline: ManagedPipeline }>(`/pipelines/${pipelineId}/stages/order`, { stageIds })
    .then(one)

/** A stage that holds deals needs `moveDealsTo`: where they go. */
export const deleteStage = (pipelineId: string, stageId: string, moveDealsTo?: string) =>
  api
    .delete(`/pipelines/${pipelineId}/stages/${stageId}`, { params: { moveDealsTo } })
    .then(() => undefined)
