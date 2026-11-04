import { LayoutDashboard, ShieldCheck, Tag, UserRound, Users, type LucideIcon } from 'lucide-react'

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
  { label: 'Contacts', to: '/contacts', icon: Users, permission: 'contacts:read' },
  { label: 'Tags', to: '/tags', icon: Tag, permission: 'tags:manage' },
  { label: 'My profile', to: '/profile', icon: UserRound },
  { label: 'Users & roles', to: '/admin/users', icon: ShieldCheck, permission: 'users:manage' },
]
