import { useAuthStore } from '@/store/auth-store'

/** True if the signed-in user's role grants `permission`. UI hint only; the API enforces it. */
export function usePermission(permission: string) {
  return useAuthStore((s) => s.user?.permissions.includes(permission) ?? false)
}
