import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Handshake, Pencil, Plus } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { getErrorMessage } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataPagination } from '@/components/ui/data-pagination'
import { EmptyState } from '@/components/ui/empty-state'
import { Filters } from '@/components/ui/filters'
import { SearchInput } from '@/components/ui/search-input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatMoney } from '@/features/dashboard/format'
import { usePermission } from '@/hooks/use-permission'
import { listDeals, type DealStatus } from '@/services/deals'
import { formatCalendarDate } from '@/utils/format-date'
import { STATUS_LABELS } from './schemas'

const PAGE_SIZE = 20

const FILTERS = [
  {
    key: 'status',
    label: 'Status',
    options: (['OPEN', 'WON', 'LOST'] as const).map((s) => ({ value: s, label: STATUS_LABELS[s] })),
  },
]

const statusVariant: Record<DealStatus, 'secondary' | 'default' | 'destructive'> = {
  OPEN: 'secondary',
  WON: 'default',
  LOST: 'destructive',
}

export function DealsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const canWrite = usePermission('deals:write')
  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const pageParam = Number(searchParams.get('page'))
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1
  const filtered = Boolean(q || status)

  const update = (changes: Record<string, string | undefined>) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true },
    )

  const { data, isPending, isError, error, isPlaceholderData } = useQuery({
    queryKey: ['deals', 'list', { q, status, page }],
    queryFn: () =>
      listDeals({ q: q || undefined, status: status || undefined, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  const newButton = canWrite && (
    <Button asChild>
      <Link to="/deals/new">
        <Plus /> New deal
      </Link>
    </Button>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Deals</h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              {data.total} {data.total === 1 ? 'deal' : 'deals'}
              {filtered && ' match your search'}
            </p>
          )}
        </div>
        {newButton}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onSearch={(v) => update({ q: v.trim() || undefined, page: undefined })}
          placeholder="Search deal or company…"
          className="w-full sm:w-96"
        />
        <Filters
          filters={FILTERS}
          values={{ status }}
          onChange={(v) => update({ status: v.status, page: undefined })}
        />
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(error, 'Could not load deals')}
        </p>
      ) : isPending ? (
        <div className="space-y-2" aria-label="Loading deals">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : data.deals.length === 0 ? (
        <EmptyState
          icon={<Handshake className="size-10" />}
          title={filtered ? 'No deals match' : 'No deals yet'}
          description={
            filtered
              ? 'Try a different search or filter.'
              : canWrite
                ? 'Add your first deal to start tracking opportunities.'
                : 'Deals will appear here once someone adds them.'
          }
          action={
            filtered ? (
              <Button
                variant="outline"
                onClick={() => update({ q: undefined, status: undefined, page: undefined })}
              >
                Show all deals
              </Button>
            ) : (
              newButton || undefined
            )
          }
        />
      ) : (
        <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Probability</TableHead>
                <TableHead>Expected close</TableHead>
                <TableHead>Owner</TableHead>
                {canWrite && (
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.deals.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.title}</TableCell>
                  <TableCell>
                    {d.company ? (
                      d.company.name
                    ) : d.contact ? (
                      `${d.contact.firstName} ${d.contact.lastName}`
                    ) : (
                      <Dash />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {d.stage.name}
                      {d.status !== 'OPEN' && (
                        <Badge variant={statusVariant[d.status]}>{STATUS_LABELS[d.status]}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{formatMoney(d.amount)}</TableCell>
                  <TableCell className="text-right">{d.probability}%</TableCell>
                  <TableCell>
                    {d.expectedClose ? formatCalendarDate(d.expectedClose) : <Dash />}
                  </TableCell>
                  <TableCell>
                    {d.owner ? `${d.owner.firstName} ${d.owner.lastName}` : <Dash />}
                  </TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/deals/${d.id}/edit`} aria-label={`Edit ${d.title}`}>
                          <Pencil /> Edit
                        </Link>
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex justify-end">
            <DataPagination
              page={data.page}
              pageCount={Math.max(1, Math.ceil(data.total / data.pageSize))}
              onPageChange={(p) => update({ page: p > 1 ? String(p) : undefined })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Dash() {
  return (
    <span className="text-muted-foreground">
      <span aria-hidden>—</span>
      <span className="sr-only">None</span>
    </span>
  )
}
