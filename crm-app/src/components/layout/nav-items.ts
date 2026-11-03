import { LayoutDashboard, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react'

export type NavItem = {
  label: string
  to: string
  icon: LucideIcon
  /** Hide the item unless the user has this permission. */
  permission?: string
}

/** Add new modules (contacts, deals, …) here as they are built. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'My profile', to: '/profile', icon: UserRound },
  { label: 'Users & roles', to: '/admin/users', icon: ShieldCheck, permission: 'users:manage' },
]
