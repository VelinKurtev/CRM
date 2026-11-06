import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Target } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

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
import { LEAD_PRIORITIES, LEAD_STATUSES, type LeadStatus } from '@/services/lead-options'
import { listLeads, setLeadStage, type Lead } from '@/services/leads'
import { PRIORITY_LABELS, STATUS_LABELS } from './schemas'

const PAGE_SIZE = 20

const FILTERS = [
  {
    key: 'priority',
    label: 'Priority',
    options: LEAD_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })),
  },
]

const priorityVariant = { HIGH: 'destructive', MEDIUM: 'secondary', LOW: 'outline' } as const

export function LeadsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const canWrite = usePermission('leads:write')
  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const pageParam = Number(searchParams.get('page'))
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1
  const filtered = Boolean(q || status || priority)

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
    queryKey: ['leads', { q, status, priority, page }],
    queryFn: () =>
      listLeads({
        q: q || undefined,
        status: status || undefined,
        priority: priority || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  })

  const newButton = canWrite && (
    <Button asChild>
      <Link to="/leads/new">
        <Plus /> New lead
      </Link>
    </Button>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              {data.total} {data.total === 1 ? 'lead' : 'leads'}
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
          placeholder="Search title or source…"
          className="w-full sm:w-96"
        />
        <Filters
          filters={FILTERS}
          values={{ status, priority }}
          extraActive={Boolean(status)}
          onChange={(v) => update({ status: v.status, priority: v.priority, page: undefined })}
        />
      </div>

      <nav aria-label="Pipeline stages" className="flex flex-wrap gap-2">
        {LEAD_STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? 'default' : 'outline'}
            aria-pressed={status === s}
            onClick={() => update({ status: status === s ? undefined : s, page: undefined })}
          >
            {STATUS_LABELS[s]}
            <span className="tabular-nums opacity-70">{data?.stageCounts[s] ?? 0}</span>
          </Button>
        ))}
      </nav>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(error, 'Could not load leads')}
        </p>
      ) : isPending ? (
        <div className="space-y-2" aria-label="Loading leads">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : data.leads.length === 0 ? (
        <EmptyState
          icon={<Target className="size-10" />}
          title={filtered ? 'No leads match' : 'No leads yet'}
          description={
            filtered
              ? 'Try a different search or filter.'
              : canWrite
                ? 'Add your first lead to start tracking potential customers.'
                : 'Leads will appear here once someone adds them.'
          }
          action={
            filtered ? (
              <Button
                variant="outline"
                onClick={() =>
                  update({ q: undefined, status: undefined, priority: undefined, page: undefined })
                }
              >
                Show all leads
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
                <TableHead>Title</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Owner</TableHead>
                {canWrite && (
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.leads.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.title}</TableCell>
                  <TableCell>{l.source ?? <Dash />}</TableCell>
                  <TableCell className="text-right">
                    {l.value === null ? <Dash /> : formatMoney(l.value)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={priorityVariant[l.priority]}>
                      {PRIORITY_LABELS[l.priority]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StageCell lead={l} canWrite={canWrite} />
                  </TableCell>
                  <TableCell>
                    {l.owner ? `${l.owner.firstName} ${l.owner.lastName}` : <Dash />}
                  </TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/leads/${l.id}/edit`} aria-label={`Edit ${l.title}`}>
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

/** The stage as a progress bar through the pipeline, with a control to move it on or back. */
function StageCell({ lead, canWrite }: { lead: Lead; canWrite: boolean }) {
  const queryClient = useQueryClient()
  const move = useMutation({
    mutationFn: (stage: LeadStatus) => setLeadStage(lead.id, stage),
    onSuccess: (updated) => {
      toast.success(`${updated.title} is now ${STATUS_LABELS[updated.status]}`)
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      void queryClient.invalidateQueries({ queryKey: ['lead', lead.id] })
      void queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith('dashboard'),
      })
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not move the lead')),
  })

  // Six steps from New to Won; a lost lead has no progress to show.
  const steps = LEAD_STATUSES.slice(0, 6)
  const reached = lead.status === 'LOST' ? -1 : steps.indexOf(lead.status)

  return (
    <div className="flex min-w-36 flex-col gap-1">
      {canWrite ? (
        <select
          aria-label={`Stage for ${lead.title}`}
          value={lead.status}
          disabled={move.isPending}
          onChange={(e) => move.mutate(e.target.value as LeadStatus)}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      ) : (
        <span>{STATUS_LABELS[lead.status]}</span>
      )}
      <div aria-hidden className="flex gap-0.5">
        {steps.map((s, i) => (
          <span
            key={s}
            className={`h-1 flex-1 rounded-full ${
              lead.status === 'LOST'
                ? 'bg-destructive/40'
                : i <= reached
                  ? 'bg-primary'
                  : 'bg-muted'
            }`}
          />
        ))}
      </div>
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
