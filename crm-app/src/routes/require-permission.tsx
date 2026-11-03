import { Link, Outlet } from 'react-router-dom'

import { usePermission } from '@/hooks/use-permission'

export function ForbiddenPage() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p className="mt-2 text-muted-foreground">Your role doesn't allow you to view this page.</p>
      <Link to="/dashboard" className="mt-4 inline-block text-sm underline">
        Back to dashboard
      </Link>
    </main>
  )
}

/** Use inside ProtectedRoute: shows "Access denied" unless the user has the permission. */
export function RequirePermission({ permission }: { permission: string }) {
  return usePermission(permission) ? <Outlet /> : <ForbiddenPage />
}
