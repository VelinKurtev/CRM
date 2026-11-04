import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Building2, ExternalLink, Pencil } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { NotesSection } from '@/features/notes/notes-section'
import { formatDate } from '@/utils/format-date'
import { getErrorMessage } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DetailSection, EmptyNote, Fact, None } from '@/components/detail-section'
import { EmptyState } from '@/components/ui/empty-state'
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
import { getCompanyOverview, type CompanyDeal } from '@/services/companies'

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    amount,
  )
const STATUS_LABEL: Record<CompanyDeal['status'], string> = {
  OPEN: 'Open',
  WON: 'Won',
  LOST: 'Lost',
}

export function CompanyDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const canWrite = usePermission('companies:write')
  const canEditContacts = usePermission('contacts:write')
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['company', id, 'overview'],
    queryFn: () => getCompanyOverview(id),
    retry: false,
  })

  if (isPending) return <Skeleton className="mx-auto h-96 max-w-4xl" aria-label="Loading company" />

  if (isError) {
    const missing = axios.isAxiosError(error) && error.response?.status === 404
    return (
      <EmptyState
        icon={<Building2 className="size-10" />}
        title={missing ? 'Company not found' : 'Could not load the company'}
        description={
          missing ? 'It may have been removed.' : getErrorMessage(error, 'Please try again.')
        }
        action={
          <Button variant="outline" onClick={() => navigate('/companies')}>
            Back to companies
          </Button>
        }
      />
    )
  }

  const { company, contacts, deals, notes } = data
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{company.name}</h1>
          {company.industry && <p className="text-muted-foreground">{company.industry}</p>}
        </div>
        {canWrite && (
          <Button asChild variant="outline">
            <Link to={`/companies/${company.id}/edit`}>
              <Pencil /> Edit company
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Website">
              {company.website ? (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  {company.website.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : (
                <None />
              )}
            </Fact>
            <Fact label="Employees">
              {company.employees === null ? <None /> : company.employees.toLocaleString('en-US')}
            </Fact>
            <Fact label="Annual revenue">
              {company.revenue === null ? <None /> : formatMoney(company.revenue)}
            </Fact>
            <Fact label="Owner">
              {company.owner ? `${company.owner.firstName} ${company.owner.lastName}` : <None />}
            </Fact>
          </dl>
        </CardContent>
      </Card>

      {contacts && (
        <DetailSection title="Contacts" total={contacts.total} shown={contacts.items.length}>
          {contacts.items.length === 0 ? (
            <EmptyNote>No contacts at this company yet.</EmptyNote>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Job title</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.items.map((c) => {
                  const name = `${c.firstName} ${c.lastName}`
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {canEditContacts ? (
                          <Link to={`/contacts/${c.id}/edit`} className="hover:underline">
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                      </TableCell>
                      <TableCell>{c.jobTitle ?? <None />}</TableCell>
                      <TableCell>
                        {c.email ? (
                          <a href={`mailto:${c.email}`} className="hover:underline">
                            {c.email}
                          </a>
                        ) : (
                          <None />
                        )}
                      </TableCell>
                      <TableCell>{c.phone ?? <None />}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </DetailSection>
      )}

      {deals && (
        <DetailSection title="Deals" total={deals.total} shown={deals.items.length}>
          {deals.open.length > 0 && (
            <p className="text-sm">
              Open:{' '}
              {deals.open
                .map(
                  (o) =>
                    `${money(o.value, o.currency)} in ${o.count} ${o.count === 1 ? 'deal' : 'deals'}`,
                )
                .join(' · ')}
            </p>
          )}
          {deals.items.length === 0 ? (
            <EmptyNote>No deals with this company yet.</EmptyNote>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Expected close</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.items.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.title}</TableCell>
                    <TableCell>{d.stage}</TableCell>
                    <TableCell>
                      <Badge variant={d.status === 'OPEN' ? 'secondary' : 'outline'}>
                        {STATUS_LABEL[d.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{money(d.amount, d.currency)}</TableCell>
                    <TableCell>
                      {d.expectedClose ? formatDate(d.expectedClose) : <None />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DetailSection>
      )}

      {notes && (
        <NotesSection
          target={{ companyId: company.id }}
          notes={notes}
          queryKey={['company', id, 'overview']}
          emptyText="No notes on this company yet."
        />
      )}
    </div>
  )
}
