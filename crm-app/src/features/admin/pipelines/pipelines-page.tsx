import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Pencil, Plus, Star, Trash2, Workflow } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { getErrorMessage } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { refreshDeals } from '@/features/deals/invalidate'
import {
  addStage,
  createPipeline,
  deletePipeline,
  deleteStage,
  listManagedPipelines,
  makeDefaultPipeline,
  renamePipeline,
  reorderStages,
  updateStage,
  type ManagedStage,
} from '@/services/pipelines'
import { DeletePipelineDialog, PipelineNameDialog } from './pipeline-dialogs'
import { DeleteStageDialog, StageDialog } from './stage-dialogs'
import { canMove, kindOf, KIND_LABELS, moved } from './stage-rules'

type Dialog =
  | { type: 'new-pipeline' }
  | { type: 'rename-pipeline' }
  | { type: 'delete-pipeline' }
  | { type: 'add-stage' }
  | { type: 'edit-stage'; stage: ManagedStage }
  | { type: 'delete-stage'; stage: ManagedStage }

const kindVariant = { open: 'secondary', won: 'default', lost: 'destructive' } as const

/** Admins set up the sales pipelines and their stages: names, order, probabilities, won and lost. */
export function PipelinesPage() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState('')
  const [dialog, setDialog] = useState<Dialog | null>(null)

  const pipelines = useQuery({
    queryKey: ['deals', 'pipelines', 'manage'],
    queryFn: listManagedPipelines,
  })
  const list = pipelines.data ?? []
  // The one chosen, or the default (listed first) when none is, or the chosen one has gone.
  const pipeline = list.find((p) => p.id === selectedId) ?? list[0]

  /** Deals, boards and forms elsewhere all show pipelines, so they are refreshed too. */
  const changed = (message?: string) => {
    if (message) toast.success(message)
    void refreshDeals(queryClient)
  }
  const close = () => setDialog(null)

  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderStages(pipeline!.id, ids),
    onSuccess: () => changed(),
    onError: (e) => toast.error(getErrorMessage(e, 'Could not move the stage')),
  })
  const makeDefault = useMutation({
    mutationFn: () => makeDefaultPipeline(pipeline!.id),
    onSuccess: (p) => changed(`${p.name} is now the default pipeline`),
    onError: (e) => toast.error(getErrorMessage(e, 'Could not change the default')),
  })

  if (pipelines.isPending) {
    return <Skeleton className="mx-auto h-96 max-w-4xl" aria-label="Loading pipelines" />
  }
  if (pipelines.isError || !pipeline) {
    return (
      <EmptyState
        icon={<Workflow className="size-10" />}
        title="Could not load the pipelines"
        description={getErrorMessage(pipelines.error, 'Please try again.')}
      />
    )
  }

  const canDelete = !pipeline.isDefault && pipeline.dealCount === 0

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Pipelines</h1>
          <p className="text-sm text-muted-foreground">
            The stages deals move through. New deals start in the first stage of the default
            pipeline.
          </p>
        </div>
        <Button onClick={() => setDialog({ type: 'new-pipeline' })}>
          <Plus /> New pipeline
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Pipeline"
          value={pipeline.id}
          onChange={(e) => setSelectedId(e.target.value)}
          className="h-9 min-w-48 rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30"
        >
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isDefault ? ' (default)' : ''}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => setDialog({ type: 'rename-pipeline' })}>
          <Pencil /> Rename
        </Button>
        {!pipeline.isDefault && (
          <Button
            variant="outline"
            size="sm"
            disabled={makeDefault.isPending}
            onClick={() => makeDefault.mutate()}
          >
            <Star /> Make default
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={!canDelete}
          title={
            pipeline.isDefault
              ? 'Make another pipeline the default first'
              : pipeline.dealCount > 0
                ? 'It has deals'
                : undefined
          }
          onClick={() => setDialog({ type: 'delete-pipeline' })}
        >
          <Trash2 /> Delete
        </Button>
        {pipeline.isDefault && <Badge>Default</Badge>}
        <span className="text-sm text-muted-foreground">
          {pipeline.dealCount} {pipeline.dealCount === 1 ? 'deal' : 'deals'}
        </span>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>
            <h2>Stages</h2>
          </CardTitle>
          <Button size="sm" onClick={() => setDialog({ type: 'add-stage' })}>
            <Plus /> Add stage
          </Button>
        </CardHeader>
        <CardContent>
          <ol className="divide-y rounded-md border" aria-label={`Stages of ${pipeline.name}`}>
            {pipeline.stages.map((stage, i) => {
              const kind = kindOf(stage)
              return (
                <li key={stage.id} className="flex flex-wrap items-center gap-3 p-3">
                  <span className="w-5 text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{stage.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {stage.probability}% ·{' '}
                      {stage.dealCount === 0
                        ? 'no deals'
                        : `${stage.dealCount} ${stage.dealCount === 1 ? 'deal' : 'deals'}`}
                    </p>
                  </div>
                  <Badge variant={kindVariant[kind]}>{KIND_LABELS[kind]}</Badge>
                  <div className="flex items-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${stage.name} up`}
                      disabled={reorder.isPending || !canMove(pipeline.stages, i, -1)}
                      onClick={() => reorder.mutate(moved(pipeline.stages, i, -1))}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${stage.name} down`}
                      disabled={reorder.isPending || !canMove(pipeline.stages, i, 1)}
                      onClick={() => reorder.mutate(moved(pipeline.stages, i, 1))}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${stage.name}`}
                      onClick={() => setDialog({ type: 'edit-stage', stage })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${stage.name}`}
                      disabled={pipeline.stages.length === 1}
                      onClick={() => setDialog({ type: 'delete-stage', stage })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            The first stage must be open. A won stage is always 100% and a lost stage 0%.
          </p>
        </CardContent>
      </Card>

      {dialog?.type === 'new-pipeline' && (
        <PipelineNameDialog
          open
          onOpenChange={(open) => !open && close()}
          title="New pipeline"
          description="It starts with the standard stages, which you can then change."
          initial=""
          submitLabel="Create pipeline"
          save={createPipeline}
          onSaved={(p) => {
            setSelectedId(p.id)
            changed(`${p.name} was created`)
          }}
        />
      )}
      {dialog?.type === 'rename-pipeline' && (
        <PipelineNameDialog
          open
          onOpenChange={(open) => !open && close()}
          title="Rename pipeline"
          initial={pipeline.name}
          submitLabel="Save name"
          save={(name) => renamePipeline(pipeline.id, name)}
          onSaved={(p) => changed(`Renamed to ${p.name}`)}
        />
      )}
      {dialog?.type === 'delete-pipeline' && (
        <DeletePipelineDialog
          pipeline={pipeline}
          onClose={close}
          remove={deletePipeline}
          onDeleted={() => {
            setSelectedId('')
            changed(`${pipeline.name} was deleted`)
          }}
        />
      )}
      {dialog?.type === 'add-stage' && (
        <StageDialog
          open
          onOpenChange={(open) => !open && close()}
          stage={null}
          isFirst={false}
          save={(input) => addStage(pipeline.id, input)}
          onSaved={() => changed('Stage added')}
        />
      )}
      {dialog?.type === 'edit-stage' && (
        <StageDialog
          key={dialog.stage.id}
          open
          onOpenChange={(open) => !open && close()}
          stage={dialog.stage}
          isFirst={pipeline.stages[0]?.id === dialog.stage.id}
          save={(input) => updateStage(pipeline.id, dialog.stage.id, input)}
          onSaved={() => changed('Stage saved')}
        />
      )}
      {dialog?.type === 'delete-stage' && (
        <DeleteStageDialog
          stage={dialog.stage}
          others={pipeline.stages.filter((s) => s.id !== dialog.stage.id)}
          onClose={close}
          remove={(stageId, to) => deleteStage(pipeline.id, stageId, to)}
          onDeleted={() => changed('Stage deleted')}
        />
      )}
    </div>
  )
}
