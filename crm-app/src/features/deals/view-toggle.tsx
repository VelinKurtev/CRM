import { KanbanSquare, List } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { cn } from '@/utils/cn'

const link = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
    isActive ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
  )

/** Switch between the deals as a list and as a board. */
export function ViewToggle() {
  return (
    <nav aria-label="Deals view" className="inline-flex rounded-lg bg-muted p-0.5">
      <NavLink to="/deals" end className={link}>
        <List className="size-4" /> List
      </NavLink>
      <NavLink to="/deals/board" className={link}>
        <KanbanSquare className="size-4" /> Board
      </NavLink>
    </nav>
  )
}
