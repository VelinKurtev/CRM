import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { ExternalLink, Pencil, UserX } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { formatDate } from '@/utils/format-date'
import { getErrorMessage } from '@/api/client'
import { DetailSection, EmptyNote, Fact, None } from '@/components/detail-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission } from '@/hooks/use-permission'
import {
  getContactOverview,
  type ActivityType,
  type ContactOverview,
  type TaskStatus,
} from '@/services/contacts'

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  CALL: 'Call',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  NOTE: 'Note',
  OTHER: 'Other',
}
const TASK_LABEL: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
}

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`

/** Social links worth showing, as (label, url). */
function links(c: ContactOverview['contact']) {
  return [
    ['LinkedIn', c.linkedinUrl],
    ['X / Twitter', c.twitterUrl],
    ['Facebook', c.facebookUrl],
  ].filter((l): l is [string, string] => Boolean(l[1]))
}

export function ContactDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const canWrite = usePermission('contacts:write')
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['contact', id, 'overview'],
    queryFn: () => getContactOverview(id),
    retry: false,
  })

  if (isPending) return <Skeleton className="mx-auto h-96 max-w-4xl" aria-label="Loading contact" />

  if (isError) {
    const missing = axios.isAxiosError(error) && error.response?.status === 404
    return (
      <EmptyState
        icon={<UserX className="size-10" />}
        title={missing ? 'Contact not found' : 'Could not load the contact'}
        description={
          missing ? 'It may have been deleted.' : getErrorMessage(error, 'Please try again.')
        }
        action={
          <Button variant="outline" onClick={() => navigate('/contacts')}>
            Back to contacts
          </Button>
        }
      />
    )
  }

  const { contact: c, activities, tasks, emails, notes } = data
  const address = [c.address, [c.postalCode, c.city].filter(Boolean).join(' '), c.country]
    .filter(Boolean)
    .join(', ')
  const now = Date.now()

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{fullName(c)}</h1>
          {(c.jobTitle || c.company) && (
            <p className="text-muted-foreground">
              {c.jobTitle}
              {c.jobTitle && c.company && ' at '}
              {c.company && (
                <Link to={`/companies/${c.company.id}`} className="hover:underline">
                  {c.company.name}
                </Link>
              )}
            </p>
          )}
          {c.tags.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1" aria-label="Tags">
              {c.tags.map((t) => (
                <li key={t}>
                  <Badge variant="secondary">{t}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
        {canWrite && (
          <Button asChild variant="outline">
            <Link to={`/contacts/${c.id}/edit`}>
              <Pencil /> Edit contact
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Email">
              {c.email ? (
                <a href={`mailto:${c.email}`} className="hover:underline">
                  {c.email}
                </a>
              ) : (
                <None />
              )}
            </Fact>
            <Fact label="Phone">{c.phone ?? <None />}</Fact>
            <Fact label="Address">{address || <None />}</Fact>
            <Fact label="Owner">{c.owner ? fullName(c.owner) : <None />}</Fact>
            {links(c).length > 0 && (
              <Fact label="Links">
                <span className="flex flex-wrap gap-x-3">
                  {links(c).map(([label, url]) => (
                    <a
                      key={label}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      {label}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ))}
                </span>
              </Fact>
            )}
          </dl>
        </CardContent>
      </Card>

      {activities && (
        <DetailSection title="Activities" total={activities.total} shown={activities.items.length}>
          {activities.items.length === 0 ? (
            <EmptyNote>No calls, meetings or other activity logged yet.</EmptyNote>
          ) : (
            <ul className="space-y-3">
              {activities.items.map((a) => (
                <li key={a.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{ACTIVITY_LABEL[a.type]}</Badge>
                    <span className="font-medium">{a.subject}</span>
                  </div>
                  {a.description && (
                    <p className="mt-1 text-sm whitespace-pre-wrap">{a.description}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fullName(a.user)} · {formatDate(a.occurredAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>
      )}

      {tasks && (
        <DetailSection title="Tasks" total={tasks.total} shown={tasks.items.length}>
          {tasks.items.length === 0 ? (
            <EmptyNote>No tasks for this contact yet.</EmptyNote>
          ) : (
            <ul className="space-y-2">
              {tasks.items.map((t) => {
                const overdue =
                  t.status !== 'DONE' && t.dueDate !== null && new Date(t.dueDate).getTime() < now
                return (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-3"
                  >
                    <span
                      className={
                        t.status === 'DONE' ? 'text-muted-foreground line-through' : 'font-medium'
                      }
                    >
                      {t.title}
                    </span>
                    <Badge variant={t.status === 'DONE' ? 'outline' : 'secondary'}>
                      {TASK_LABEL[t.status]}
                    </Badge>
                    {t.dueDate && (
                      <span
                        className={
                          overdue ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
                        }
                      >
                        {overdue ? 'Overdue · ' : 'Due '}
                        {formatDate(t.dueDate)}
                      </span>
                    )}
                    {t.assignee && (
                      <span className="ml-auto text-sm text-muted-foreground">
                        {fullName(t.assignee)}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </DetailSection>
      )}

      {emails && (
        <DetailSection title="Emails" total={emails.total} shown={emails.items.length}>
          {emails.items.length === 0 ? (
            <EmptyNote>No emails with this contact yet.</EmptyNote>
          ) : (
            <ul className="space-y-3">
              {emails.items.map((m) => (
                <li key={m.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.subject}</span>
                    {!m.sentAt && <Badge variant="outline">Draft</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {m.fromAddr} → {m.toAddr} · {formatDate(m.sentAt ?? m.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>
      )}

      {notes && (
        <DetailSection title="Notes" total={notes.total} shown={notes.items.length}>
          {notes.items.length === 0 ? (
            <EmptyNote>No notes on this contact yet.</EmptyNote>
          ) : (
            <ul className="space-y-3">
              {notes.items.map((n) => (
                <li key={n.id} className="rounded-md border p-3">
                  <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fullName(n.author)} · {formatDate(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>
      )}
    </div>
  )
}
