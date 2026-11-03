import { api } from '@/api/client'

/** A section is null when the user's role can't read that data. */
export type DashboardSummary = {
  sales: { wonThisMonth: { revenue: number; deals: number }; wonLastMonthRevenue: number } | null
  newLeads: { last7Days: number; awaitingContact: number } | null
  openDeals: { count: number; value: number } | null
}

export const getDashboardSummary = () =>
  api.get<DashboardSummary>('/dashboard/summary').then((r) => r.data)

export type RevenueMonth = { month: string; revenue: number; deals: number }

/** Revenue won per month, last 12 months, oldest first. Needs `reports:read`. */
export const getRevenueTrend = () =>
  api.get<{ months: RevenueMonth[] }>('/dashboard/revenue').then((r) => r.data.months)

export type AttentionTask = {
  id: string
  title: string
  status: 'TODO' | 'IN_PROGRESS' | 'DONE'
  dueDate: string | null
}
export type AttentionActivity = {
  id: string
  type: 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE' | 'OTHER'
  subject: string
  occurredAt: string
  user: { firstName: string; lastName: string }
  contact: { firstName: string; lastName: string } | null
  deal: { title: string } | null
}
export type AttentionNotification = {
  id: string
  type: string
  message: string
  readAt: string | null
  createdAt: string
}
/** `tasks` / `activities` are null when the role can't read them. */
export type Attention = {
  tasks: { items: AttentionTask[]; open: number; overdue: number } | null
  activities: AttentionActivity[] | null
  notifications: { items: AttentionNotification[]; unread: number }
}

export const getAttention = () => api.get<Attention>('/dashboard/attention').then((r) => r.data)
