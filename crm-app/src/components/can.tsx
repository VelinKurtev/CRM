import type { ReactNode } from 'react'

import { usePermission } from '@/hooks/use-permission'

/** Render children only if the user has the permission. */
export function Can({ permission, children }: { permission: string; children: ReactNode }) {
  return usePermission(permission) ? children : null
}
