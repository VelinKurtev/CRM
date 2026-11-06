import {
  Building2,
  Handshake,
  LayoutDashboard,
  ShieldCheck,
  Tag,
  Target,
  UserRound,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

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
  { label: 'Companies', to: '/companies', icon: Building2, permission: 'companies:read' },
  { label: 'Deals', to: '/deals', icon: Handshake, permission: 'deals:read' },
  { label: 'Leads', to: '/leads', icon: Target, permission: 'leads:read' },
  { label: 'Tags', to: '/tags', icon: Tag, permission: 'tags:manage' },
  { label: 'My profile', to: '/profile', icon: UserRound },
  { label: 'Pipelines', to: '/admin/pipelines', icon: Workflow, permission: 'settings:manage' },
  { label: 'Users & roles', to: '/admin/users', icon: ShieldCheck, permission: 'users:manage' },
]
