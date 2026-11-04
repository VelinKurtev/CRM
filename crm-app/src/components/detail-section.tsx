import type { ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** A quiet placeholder for a missing value. */
export const None = () => <span className="text-muted-foreground">—</span>

/** A titled card for one kind of related record on a detail page. */
export function DetailSection({
  title,
  total,
  shown,
  children,
}: {
  title: string
  total: number
  shown: number
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>
            {title} <span className="font-normal text-muted-foreground">({total})</span>
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
        {total > shown && (
          <p className="text-sm text-muted-foreground">
            Showing {shown} of {total}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export const EmptyNote = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-muted-foreground">{children}</p>
)

/** A label with its value, for the facts at the top of a detail page. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}
