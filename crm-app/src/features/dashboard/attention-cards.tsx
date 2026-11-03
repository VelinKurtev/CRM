import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow, isPast } from 'date-fns'
import {
  AlertCircle,
  Bell,
  CalendarClock,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getAttention,
  type AttentionActivity,
  type AttentionNotification,
  type AttentionTask,
} from '@/services/dashboard'

const ACTIVITY_ICONS: Record<AttentionActivity['type'], LucideIcon> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: Users,
  NOTE: StickyNote,
  OTHER: MessageSquare,
}
const ACTIVITY_LABELS: Record<AttentionActivity['type'], string> = {
  CALL: 'Call',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  NOTE: 'Note',
  OTHER: 'Activity',
}

const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true })

function Section({
  title,
  description,
  badge,
  empty,
  children,
}: {
  title: string
  description: string
  badge?: ReactNode
  empty: string | null
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {badge && <CardAction>{badge}</CardAction>}
      </CardHeader>
      <CardContent>
        {empty ? <p className="text-sm text-muted-foreground">{empty}</p> : children}
      </CardContent>
    </Card>
  )
}

function TaskRow({ task }: { task: AttentionTask }) {
  const due = task.dueDate ? new Date(task.dueDate) : null
  const overdue = due ? isPast(due) : false
  return (
    <li className="flex items-start justify-between gap-3">
      <span className="text-sm font-medium">{task.title}</span>
      <span
        className={`flex shrink-0 items-center gap-1 text-xs ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {overdue ? (
          <AlertCircle className="size-3" aria-hidden />
        ) : (
          <CalendarClock className="size-3" aria-hidden />
        )}
        {due
          ? `${overdue ? 'Overdue' : 'Due'} ${formatDistanceToNow(due, { addSuffix: true })}`
          : 'No due date'}
      </span>
    </li>
  )
}

function ActivityRow({ activity: a }: { activity: AttentionActivity }) {
  const Icon = ACTIVITY_ICONS[a.type]
  const about = a.contact ? `${a.contact.firstName} ${a.contact.lastName}` : a.deal?.title
  return (
    <li className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-medium">
          <span className="sr-only">{ACTIVITY_LABELS[a.type]}: </span>
          {a.subject}
        </p>
        <p className="text-xs text-muted-foreground">
          {a.user.firstName} {a.user.lastName}
          {about && ` · ${about}`} · {ago(a.occurredAt)}
        </p>
      </div>
    </li>
  )
}

function NotificationRow({ n }: { n: AttentionNotification }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-primary'}`}
        aria-hidden
      />
      <div className="min-w-0">
        <p className={`text-sm ${n.readAt ? '' : 'font-medium'}`}>
          {!n.readAt && <span className="sr-only">Unread: </span>}
          {n.message}
        </p>
        <p className="text-xs text-muted-foreground">{ago(n.createdAt)}</p>
      </div>
    </li>
  )
}

export function AttentionCards() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['dashboard-attention'],
    queryFn: getAttention,
  })

  if (isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load tasks and activity
      </p>
    )
  if (isPending)
    return (
      <div className="grid gap-4 lg:grid-cols-3" aria-label="Loading tasks and activity">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-56" />
        ))}
      </div>
    )

  const { tasks, activities, notifications } = data
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {tasks && (
        <Section
          title="Upcoming tasks"
          description="Assigned to you, soonest first"
          badge={
            tasks.overdue > 0 ? (
              <Badge variant="destructive">{tasks.overdue} overdue</Badge>
            ) : undefined
          }
          empty={tasks.items.length === 0 ? 'You have no open tasks.' : null}
        >
          <ul className="space-y-3">
            {tasks.items.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
          {tasks.open > tasks.items.length && (
            <p className="mt-3 text-xs text-muted-foreground">
              +{tasks.open - tasks.items.length} more open
            </p>
          )}
        </Section>
      )}
      {activities && (
        <Section
          title="Recent activity"
          description="Latest across the team"
          empty={activities.length === 0 ? 'No activity logged yet.' : null}
        >
          <ul className="space-y-3">
            {activities.map((a) => (
              <ActivityRow key={a.id} activity={a} />
            ))}
          </ul>
        </Section>
      )}
      <Section
        title="Notifications"
        description="Your latest updates"
        badge={
          notifications.unread > 0 ? (
            <Badge>
              <Bell aria-hidden /> {notifications.unread} unread
            </Badge>
          ) : undefined
        }
        empty={notifications.items.length === 0 ? "You're all caught up." : null}
      >
        <ul className="space-y-3">
          {notifications.items.map((n) => (
            <NotificationRow key={n.id} n={n} />
          ))}
        </ul>
      </Section>
    </div>
  )
}
