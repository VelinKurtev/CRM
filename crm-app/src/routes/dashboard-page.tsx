import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getDashboardSummary } from '@/services/dashboard'
import { useAuthStore } from '@/store/auth-store'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/** "+12% vs last month", or nothing when there is no last month to compare to. */
function trend(current: number, previous: number) {
  if (previous <= 0) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  return `${pct >= 0 ? '+' : ''}${pct}% vs last month`
}

function StatCard({
  title,
  value,
  detail,
}: {
  title: string
  value: ReactNode
  detail: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{detail}</CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { data, isPending, isError } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: getDashboardSummary,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome, {user?.firstName} {user?.lastName}
        </p>
      </div>

      {isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not load the dashboard
        </p>
      )}

      {isPending && (
        <div className="grid gap-4 md:grid-cols-3" aria-label="Loading dashboard">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      )}

      {data && (
        <div className="grid gap-4 md:grid-cols-3">
          {data.sales && (
            <StatCard
              title="Sales overview"
              value={currency.format(data.sales.wonThisMonth.revenue)}
              detail={
                <>
                  Won this month from {data.sales.wonThisMonth.deals}{' '}
                  {data.sales.wonThisMonth.deals === 1 ? 'deal' : 'deals'}
                  {trend(data.sales.wonThisMonth.revenue, data.sales.wonLastMonthRevenue) && (
                    <>
                      {' · '}
                      {trend(data.sales.wonThisMonth.revenue, data.sales.wonLastMonthRevenue)}
                    </>
                  )}
                </>
              }
            />
          )}
          {data.newLeads && (
            <StatCard
              title="New leads"
              value={data.newLeads.last7Days}
              detail={`In the last 7 days · ${data.newLeads.awaitingContact} awaiting contact`}
            />
          )}
          {data.openDeals && (
            <StatCard
              title="Open deals"
              value={data.openDeals.count}
              detail={`${currency.format(data.openDeals.value)} in the pipeline`}
            />
          )}
        </div>
      )}
    </div>
  )
}
