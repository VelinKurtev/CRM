import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Building2, Plus } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { DataPagination } from '@/components/ui/data-pagination'
import { EmptyState } from '@/components/ui/empty-state'
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
import { listCompanyDetails } from '@/services/companies'

const PAGE_SIZE = 20

export function CompaniesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const canWrite = usePermission('companies:write')
  const q = searchParams.get('q') ?? ''
  const pageParam = Number(searchParams.get('page'))
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1

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
    queryKey: ['companies', { q, page }],
    queryFn: () => listCompanyDetails({ q: q || undefined, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  const newButton = canWrite && (
    <Button asChild>
      <Link to="/companies/new">
        <Plus /> New company
      </Link>
    </Button>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Companies</h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              {data.total} {data.total === 1 ? 'company' : 'companies'}
              {q && ' match your search'}
            </p>
          )}
        </div>
        {newButton}
      </div>

      <SearchInput
        value={q}
        onSearch={(v) => update({ q: v.trim() || undefined, page: undefined })}
        placeholder="Search name or industry…"
        className="w-full sm:w-96"
      />

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(error, 'Could not load companies')}
        </p>
      ) : isPending ? (
        <div className="space-y-2" aria-label="Loading companies">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : data.companies.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-10" />}
          title={q ? 'No companies match' : 'No companies yet'}
          description={
            q
              ? 'Try a different search.'
              : canWrite
                ? 'Add your first company to get started.'
                : 'Companies will appear here once someone adds them.'
          }
          action={
            q ? (
              <Button variant="outline" onClick={() => update({ q: undefined, page: undefined })}>
                Show all companies
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
                <TableHead>Name</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead>Website</TableHead>
                <TableHead className="text-right">Contacts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link to={`/companies/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.industry ?? <Dash />}</TableCell>
                  <TableCell className="text-right">
                    {c.employees === null ? <Dash /> : c.employees.toLocaleString('en-US')}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.revenue === null ? <Dash /> : formatMoney(c.revenue)}
                  </TableCell>
                  <TableCell>
                    {c.website ? (
                      <a
                        href={c.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {c.website.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
                      </a>
                    ) : (
                      <Dash />
                    )}
                  </TableCell>
                  <TableCell className="text-right">{c.contactCount}</TableCell>
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
