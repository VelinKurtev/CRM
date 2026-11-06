import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Handshake, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMoney } from '@/features/dashboard/format'
import { usePermission } from '@/hooks/use-permission'
import { getBoard, listPipelines, moveDeal, type Board, type BoardStage } from '@/services/deals'
import { cn } from '@/utils/cn'
import { applyMove, dropTarget, findDeal } from './board-moves'
import { DealCard, DealCardPreview } from './deal-card'
import { refreshDeals } from './invalidate'
import { ViewToggle } from './view-toggle'

function Column({
  stage,
  stages,
  canMove,
  onMove,
}: {
  stage: BoardStage
  stages: BoardStage[]
  canMove: boolean
  onMove: (dealId: string, stageId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled: !canMove })

  return (
    <section
      aria-label={stage.name}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors',
        stage.isWon && 'border-t-4 border-t-emerald-500',
        stage.isLost && 'border-t-4 border-t-destructive/70',
        isOver && 'bg-accent ring-2 ring-ring/50',
      )}
    >
      <header className="flex items-baseline justify-between gap-2 p-3 pb-2">
        <h2 className="truncate text-sm font-semibold">{stage.name}</h2>
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          <span aria-label={`${stage.count} deals`}>{stage.count}</span> ·{' '}
          {formatMoney(stage.value)}
        </span>
      </header>
      <ul ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 p-2 pt-0">
        {stage.deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} stages={stages} canMove={canMove} onMove={onMove} />
        ))}
        {stage.deals.length === 0 && (
          <li className="px-1 py-4 text-center text-xs text-muted-foreground">No deals</li>
        )}
        {stage.count > stage.deals.length && (
          <li className="px-1 pt-1 text-center text-xs text-muted-foreground">
            Showing the latest {stage.deals.length} of {stage.count}
          </li>
        )}
      </ul>
    </section>
  )
}

/** Deals as a board: a column per stage, cards dragged between them to change their stage. */
export function DealBoardPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const canWrite = usePermission('deals:write')
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const pipelines = useQuery({ queryKey: ['deals', 'pipelines'], queryFn: listPipelines })
  // The default pipeline (listed first) unless another one is chosen.
  const pipelineId =
    pipelines.data?.find((p) => p.id === searchParams.get('pipeline'))?.id ??
    pipelines.data?.[0]?.id ??
    ''
  const boardKey = ['deals', 'board', pipelineId]
  const board = useQuery({
    queryKey: boardKey,
    queryFn: () => getBoard(pipelineId),
    enabled: pipelineId !== '',
  })

  const move = useMutation({
    mutationFn: ({ dealId, stageId }: { dealId: string; stageId: string }) =>
      moveDeal(dealId, stageId),
    // Show the card in its new column at once; put it back if the server says no.
    onMutate: async ({ dealId, stageId }) => {
      await queryClient.cancelQueries({ queryKey: boardKey })
      const before = queryClient.getQueryData<Board>(boardKey)
      if (before) queryClient.setQueryData<Board>(boardKey, applyMove(before, dealId, stageId))
      return { before }
    },
    onSuccess: (deal) => toast.success(`${deal.title} moved to ${deal.stage.name}`),
    onError: (error, _vars, context) => {
      if (context?.before) queryClient.setQueryData(boardKey, context.before)
      toast.error(getErrorMessage(error, 'Could not move the deal'))
    },
    onSettled: () => void refreshDeals(queryClient),
  })

  // A small drag distance, so clicking a card's link or menu is not mistaken for a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  const onDragEnd = (event: DragEndEvent) => {
    setDraggingId(null)
    const target = board.data && dropTarget(board.data, event)
    if (target) move.mutate(target)
  }

  const dragging = draggingId && board.data ? findDeal(board.data, draggingId)?.deal : undefined

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Deals</h1>
          <p className="text-sm text-muted-foreground">
            {canWrite
              ? 'Drag a deal to another stage, or use the menu on its card.'
              : 'Where each deal is in the pipeline.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pipelines.data && pipelines.data.length > 1 && (
            <select
              aria-label="Pipeline"
              value={pipelineId}
              onChange={(e) => setSearchParams({ pipeline: e.target.value }, { replace: true })}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30"
            >
              {pipelines.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <ViewToggle />
          {canWrite && (
            <Button asChild>
              <Link to="/deals/new">
                <Plus /> New deal
              </Link>
            </Button>
          )}
        </div>
      </div>

      {pipelines.isError || board.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(pipelines.error ?? board.error, 'Could not load the board')}
        </p>
      ) : !board.data ? (
        <div className="flex gap-3 overflow-hidden" aria-label="Loading board">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-72 shrink-0" />
          ))}
        </div>
      ) : board.data.stages.length === 0 ? (
        <EmptyState
          icon={<Handshake className="size-10" />}
          title="This pipeline has no stages"
          description="Add stages to it before deals can be placed on the board."
        />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) => setDraggingId(String(e.active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDraggingId(null)}
        >
          <div className="flex items-start gap-3 overflow-x-auto pb-3">
            {board.data.stages.map((stage) => (
              <Column
                key={stage.id}
                stage={stage}
                stages={board.data.stages}
                canMove={canWrite}
                onMove={(dealId, stageId) => move.mutate({ dealId, stageId })}
              />
            ))}
          </div>
          <DragOverlay>{dragging ? <DealCardPreview deal={dragging} /> : null}</DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
