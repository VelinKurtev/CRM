import { useDraggable } from '@dnd-kit/core'
import { CalendarDays, GripVertical } from 'lucide-react'
import { Link } from 'react-router-dom'

import { formatMoney } from '@/features/dashboard/format'
import type { BoardStage, Deal } from '@/services/deals'
import { cn } from '@/utils/cn'
import { formatCalendarDate } from '@/utils/format-date'

const customerOf = (d: Deal) =>
  d.company?.name ?? (d.contact ? `${d.contact.firstName} ${d.contact.lastName}` : null)

/** What a card says about a deal. Shared by the card on the board and the one that follows the pointer. */
function CardBody({ deal }: { deal: Deal }) {
  const customer = customerOf(deal)
  return (
    <>
      {customer && <p className="truncate text-xs text-muted-foreground">{customer}</p>}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-semibold">{formatMoney(deal.amount)}</span>
        <span className="text-xs text-muted-foreground">{deal.probability}%</span>
      </div>
      {deal.expectedClose && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="size-3" aria-hidden />
          <span className="sr-only">Expected close </span>
          {formatCalendarDate(deal.expectedClose)}
        </p>
      )}
    </>
  )
}

/** A deal on the board. People who can write can drag it, or pick a stage from its menu. */
export function DealCard({
  deal,
  stages,
  canMove,
  onMove,
}: {
  deal: Deal
  stages: BoardStage[]
  canMove: boolean
  onMove: (dealId: string, stageId: string) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: deal.id,
    disabled: !canMove,
  })

  return (
    <li
      ref={setNodeRef}
      {...(canMove ? listeners : {})}
      className={cn(
        'space-y-1.5 rounded-lg border bg-card p-3 shadow-xs',
        canMove && 'cursor-grab touch-manipulation active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-1">
        {canMove && (
          // The keyboard handle: Space picks the card up, arrows move it, Space drops it.
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            aria-label={`Drag ${deal.title}`}
            className="-ml-1.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        )}
        {canMove ? (
          <Link
            to={`/deals/${deal.id}/edit`}
            className="min-w-0 flex-1 text-sm font-medium break-words hover:underline"
          >
            {deal.title}
          </Link>
        ) : (
          <p className="min-w-0 flex-1 text-sm font-medium break-words">{deal.title}</p>
        )}
      </div>
      <CardBody deal={deal} />
      {canMove && (
        <select
          aria-label={`Move ${deal.title} to`}
          value={deal.stage.id}
          onChange={(e) => onMove(deal.id, e.target.value)}
          className="h-7 w-full rounded-md border border-input bg-transparent px-1.5 text-xs dark:bg-input/30"
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </li>
  )
}

/** The copy of a card that follows the pointer while dragging. */
export function DealCardPreview({ deal }: { deal: Deal }) {
  return (
    <div className="w-72 space-y-1.5 rounded-lg border bg-card p-3 shadow-lg">
      <p className="text-sm font-medium">{deal.title}</p>
      <CardBody deal={deal} />
    </div>
  )
}
