import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { getRevenueTrend } from '@/services/dashboard'
import { formatMoney, monthLong } from './format'
import { RevenueChart } from './revenue-chart'

export function RevenueCard() {
  const [asTable, setAsTable] = useState(false)
  const { data, isPending, isError } = useQuery({
    queryKey: ['dashboard-revenue'],
    queryFn: getRevenueTrend,
  })
  const empty = data?.every((m) => m.revenue === 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue</CardTitle>
        <CardDescription>Won deals per month, last 12 months</CardDescription>
        {data && !empty && (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)}>
              {asTable ? 'Show chart' : 'Show table'}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {isError && (
          <p role="alert" className="text-sm text-destructive">
            Could not load revenue
          </p>
        )}
        {isPending && <Skeleton className="h-64 w-full" aria-label="Loading revenue" />}
        {data && empty && (
          <EmptyState
            title="No revenue yet"
            description="Revenue from won deals will appear here as you close them."
          />
        )}
        {data && !empty && !asTable && <RevenueChart months={data} />}
        {data && !empty && asTable && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Deals won</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...data].reverse().map((m) => (
                <TableRow key={m.month}>
                  <TableCell>{monthLong(m.month)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(m.revenue)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{m.deals}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
