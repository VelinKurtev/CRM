import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuthStore } from '@/store/auth-store'

export function ProtectedRoute() {
  const token = useAuthStore((s) => s.token)
  const initialized = useAuthStore((s) => s.initialized)
  const location = useLocation()

  // Wait for the silent refresh so a reload doesn't flash the login page.
  if (!initialized) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
