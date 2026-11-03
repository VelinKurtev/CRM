import { api } from '@/api/client'

/** A section is null when the user's role can't read that data. */
export type DashboardSummary = {
  sales: { wonThisMonth: { revenue: number; deals: number }; wonLastMonthRevenue: number } | null
  newLeads: { last7Days: number; awaitingContact: number } | null
  openDeals: { count: number; value: number } | null
}

export const getDashboardSummary = () =>
  api.get<DashboardSummary>('/dashboard/summary').then((r) => r.data)
