import { InboxIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

type EmptyStateProps = {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center',
        className,
      )}
    >
      <div className="text-muted-foreground">{icon ?? <InboxIcon className="size-10" />}</div>
      <h3 className="text-lg font-medium">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
