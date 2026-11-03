import { NavLink } from 'react-router-dom'

import { cn } from '@/utils/cn'
import { useAuthStore } from '@/store/auth-store'
import { NAV_ITEMS } from './nav-items'

/** `collapsed` shows icons only (desktop). The mobile drawer always passes false. */
export function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean
  onNavigate?: () => void
}) {
  const permissions = useAuthStore((s) => s.user?.permissions)
  const items = NAV_ITEMS.filter((i) => !i.permission || permissions?.includes(i.permission))

  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-2">
      {items.map(({ label, to, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          aria-label={collapsed ? label : undefined}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
              isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
              collapsed && 'justify-center px-0',
            )
          }
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          {!collapsed && <span>{label}</span>}
        </NavLink>
      ))}
    </nav>
  )
}

export function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex h-14 items-center border-b px-4 text-lg font-semibold">
      {collapsed ? 'C' : 'CRM'}
    </div>
  )
}
