export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  SALES: 'Sales',
  SUPPORT: 'Support',
}
export const ROLE_OPTIONS = Object.keys(ROLE_LABELS)

/** `{ contacts: ['read','write'] }` from `['contacts:read', 'contacts:write']`. */
export function groupPermissions(keys: string[]) {
  const groups: Record<string, string[]> = {}
  for (const key of keys) {
    const [resource, action] = key.split(':')
    ;(groups[resource] ??= []).push(action)
  }
  return groups
}
