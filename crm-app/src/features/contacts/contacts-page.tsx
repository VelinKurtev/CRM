import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Upload, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { getErrorMessage } from '@/api/client'
import { Can } from '@/components/can'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataPagination } from '@/components/ui/data-pagination'
import { EmptyState } from '@/components/ui/empty-state'
import { Filters, type FilterDefinition } from '@/components/ui/filters'
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
import { usePermission } from '@/hooks/use-permission'
import {
  listCompanies,
  listContacts,
  listTagDetails,
  type ContactListParams,
  type ContactSort,
} from '@/services/contacts'
import { BulkTagDialog } from '@/features/tags/bulk-tag-dialog'
import { TagBadge } from '@/features/tags/tag-badge'
import { TagFilter } from '@/features/tags/tag-filter'
import { ExportMenu } from './export-menu'

const PAGE_SIZE = 20
const MAX_TAGS_SHOWN = 3

/** Everything the list shows is in the URL, so refresh, back and shared links keep it. */
function readParams(
  sp: URLSearchParams,
): Required<Pick<ContactListParams, 'q' | 'page' | 'sort' | 'dir' | 'tag'>> &
  Pick<ContactListParams, 'company' | 'tagMode' | 'owner'> {
  const sort = sp.get('sort')
  const page = Number(sp.get('page'))
  return {
    q: sp.get('q') ?? '',
    page: Number.isInteger(page) && page > 0 ? page : 1,
    sort: sort === 'company' || sort === 'createdAt' ? sort : 'name',
    dir: sp.get('dir') === 'desc' ? 'desc' : 'asc',
    company: sp.get('company') ?? undefined,
    tag: sp.getAll('tag').filter(Boolean),
    tagMode: sp.get('tagMode') === 'all' ? 'all' : undefined,
    owner: sp.get('owner') === 'me' ? 'me' : undefined,
  }
}

function SortHeader({
  label,
  field,
  sort,
  dir,
  onSort,
}: {
  label: string
  field: ContactSort
  sort: ContactSort
  dir: 'asc' | 'desc'
  onSort: (field: ContactSort) => void
}) {
  const active = sort === field
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <TableHead aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="-ml-1 flex items-center gap-1 rounded px-1 hover:text-foreground"
      >
        {label}
        <Icon className={`size-3.5 ${active ? '' : 'text-muted-foreground'}`} aria-hidden />
      </button>
    </TableHead>
  )
}

export function ContactsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = readParams(searchParams)
  const canWrite = usePermission('contacts:write')

  // Ticked rows are for the page you are looking at: any change of page or filters drops them.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkMode, setBulkMode] = useState<'add' | 'remove' | null>(null)

  const update = (changes: Record<string, string | string[] | undefined>, resetPage = true) => {
    setSelected(new Set())
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(changes)) {
          next.delete(key)
          for (const v of [value ?? []].flat()) if (v) next.append(key, v)
        }
        if (resetPage) next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  const { data, isPending, isError, error, isPlaceholderData } = useQuery({
    queryKey: ['contacts', params],
    queryFn: () => listContacts({ ...params, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  // Dropdown options. A role that can't read companies just doesn't get that filter.
  const tags = useQuery({
    queryKey: ['tag-details'],
    queryFn: () => listTagDetails(),
    staleTime: 60_000,
    retry: false,
  })
  const tagColors = new Map(tags.data?.map((t) => [t.name.toLowerCase(), t.color]))
  const companies = useQuery({
    queryKey: ['contact-filter-companies'],
    queryFn: listCompanies,
    staleTime: 60_000,
    retry: false,
  })

  const filters: FilterDefinition[] = [
    { key: 'owner', label: 'Owner', options: [{ value: 'me', label: 'My contacts' }] },
    ...(companies.data?.length
      ? [
          {
            key: 'company',
            label: 'Company',
            options: companies.data.map((c) => ({ value: c.id, label: c.name })),
          },
        ]
      : []),
  ]

  const filtering = Boolean(params.q || params.company || params.tag.length || params.owner)
  /** Clicking a tag in the list adds it to the tag filter (it stays if already there). */
  const filterByTag = (tag: string) => {
    if (params.tag.some((t) => t.toLowerCase() === tag.toLowerCase())) return
    update({ tag: [...params.tag, tag], tagMode: params.tagMode })
  }
  const onSort = (field: ContactSort) =>
    update({
      sort: field === 'name' && params.sort !== 'name' ? undefined : field,
      dir: params.sort === field && params.dir === 'asc' ? 'desc' : undefined,
    })

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const first = data ? (data.page - 1) * data.pageSize + 1 : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Contacts</h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              {data.total} {data.total === 1 ? 'contact' : 'contacts'}
              {filtering && ' match your search'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Can permission="contacts:export">
            <ExportMenu
              filters={{
                q: params.q || undefined,
                company: params.company,
                tag: params.tag,
                tagMode: params.tagMode,
                owner: params.owner,
              }}
              total={data?.total}
            />
          </Can>
          {canWrite && (
            <>
              <Button asChild variant="outline">
                <Link to="/contacts/import">
                  <Upload /> Import CSV
                </Link>
              </Button>
              <Button asChild>
                <Link to="/contacts/new">
                  <Plus /> New contact
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={params.q}
          onSearch={(q) => update({ q: q.trim() || undefined })}
          placeholder="Search name, email, phone or company…"
          className="w-full sm:w-96"
        />
        <Filters
          filters={filters}
          values={{ owner: params.owner, company: params.company }}
          extraActive={params.tag.length > 0}
          onChange={(v) =>
            // "Clear" sends no values at all, and should drop the tags too.
            update(
              Object.keys(v).length === 0
                ? { owner: undefined, company: undefined, tag: undefined, tagMode: undefined }
                : { owner: v.owner, company: v.company },
            )
          }
        />
        <TagFilter
          options={tags.data?.map((t) => t.name) ?? []}
          value={params.tag}
          mode={params.tagMode ?? 'any'}
          onChange={(tag, mode) =>
            update({ tag, tagMode: tag.length > 1 && mode === 'all' ? 'all' : undefined })
          }
        />
      </div>

      {canWrite && selected.size > 0 && (
        <div
          role="region"
          aria-label="Selected contacts"
          className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-2"
        >
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => setBulkMode('add')}>
            Add tags
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBulkMode('remove')}>
            Remove tags
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}
      <BulkTagDialog
        mode={bulkMode ?? 'add'}
        contactIds={[...selected]}
        open={bulkMode !== null}
        onOpenChange={(open) => !open && setBulkMode(null)}
        onDone={() => setSelected(new Set())}
      />

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(error, 'Could not load contacts')}
        </p>
      ) : isPending ? (
        <div className="space-y-2" aria-label="Loading contacts">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : data.contacts.length === 0 ? (
        <EmptyState
          icon={<Users className="size-10" />}
          title={filtering ? 'No contacts match' : 'No contacts yet'}
          description={
            filtering
              ? 'Try a different search or clear the filters.'
              : canWrite
                ? 'Add your first contact to get started.'
                : 'Contacts will appear here once someone adds them.'
          }
          action={
            filtering ? (
              <Button variant="outline" onClick={() => setSearchParams({}, { replace: true })}>
                Clear search and filters
              </Button>
            ) : canWrite ? (
              <Button asChild>
                <Link to="/contacts/new">
                  <Plus /> New contact
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          <Table>
            <TableHeader>
              <TableRow>
                {canWrite && (
                  <TableHead className="w-10">
                    <SelectAll
                      ids={data.contacts.map((c) => c.id)}
                      selected={selected}
                      onChange={setSelected}
                    />
                  </TableHead>
                )}
                <SortHeader
                  label="Name"
                  field="name"
                  sort={params.sort}
                  dir={params.dir}
                  onSort={onSort}
                />
                <SortHeader
                  label="Company"
                  field="company"
                  sort={params.sort}
                  dir={params.dir}
                  onSort={onSort}
                />
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.contacts.map((c) => {
                const name = `${c.firstName} ${c.lastName}`
                return (
                  <TableRow key={c.id} data-state={selected.has(c.id) ? 'selected' : undefined}>
                    {canWrite && (
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${name}`}
                          checked={selected.has(c.id)}
                          onChange={(e) =>
                            setSelected((prev) => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(c.id)
                              else next.delete(c.id)
                              return next
                            })
                          }
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      {canWrite ? (
                        <Link to={`/contacts/${c.id}/edit`} className="font-medium hover:underline">
                          {name}
                        </Link>
                      ) : (
                        <span className="font-medium">{name}</span>
                      )}
                      {c.jobTitle && (
                        <div className="text-xs text-muted-foreground">{c.jobTitle}</div>
                      )}
                    </TableCell>
                    <TableCell>{c.company?.name ?? <Dash />}</TableCell>
                    <TableCell>
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="hover:underline">
                          {c.email}
                        </a>
                      ) : (
                        <Dash />
                      )}
                    </TableCell>
                    <TableCell>{c.phone ?? <Dash />}</TableCell>
                    <TableCell>
                      {c.tags.length === 0 ? (
                        <Dash />
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {c.tags.slice(0, MAX_TAGS_SHOWN).map((t) => (
                            <TagBadge
                              key={t}
                              name={t}
                              color={tagColors.get(t.toLowerCase())}
                              onClick={() => filterByTag(t)}
                            />
                          ))}
                          {c.tags.length > MAX_TAGS_SHOWN && (
                            <Badge
                              variant="outline"
                              title={c.tags.slice(MAX_TAGS_SHOWN).join(', ')}
                            >
                              +{c.tags.length - MAX_TAGS_SHOWN}
                            </Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : <Dash />}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Showing {first}–{first + data.contacts.length - 1} of {data.total}
            </p>
            <DataPagination
              page={data.page}
              pageCount={pageCount}
              onPageChange={(page) => update({ page: page > 1 ? String(page) : undefined }, false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** The header checkbox: ticks or unticks every row on the page. */
function SelectAll({
  ids,
  selected,
  onChange,
}: {
  ids: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const count = ids.filter((id) => selected.has(id)).length
  const all = ids.length > 0 && count === ids.length
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && !all
  }, [count, all])

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Select all contacts on this page"
      checked={all}
      onChange={() => onChange(all ? new Set() : new Set(ids))}
    />
  )
}

/** A quiet placeholder for an empty cell (read aloud as "none"). */
function Dash() {
  return (
    <span className="text-muted-foreground">
      <span aria-hidden>—</span>
      <span className="sr-only">None</span>
    </span>
  )
}
