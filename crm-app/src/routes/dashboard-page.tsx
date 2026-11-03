import { Link } from 'react-router-dom'

import { Can } from '@/components/can'
import { Button } from '@/components/ui/button'
import { signOut } from '@/features/auth/session'
import { useAuthStore } from '@/store/auth-store'

// Placeholder until the real dashboard (US-011 – US-015).
export function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground">
        Welcome, {user?.firstName} {user?.lastName} ({user?.role})
      </p>
      <div className="mt-4 flex gap-2">
        <Button asChild variant="outline">
          <Link to="/profile">My profile</Link>
        </Button>
        <Can permission="users:manage">
          <Button asChild variant="outline">
            <Link to="/admin/users">Manage users</Link>
          </Button>
        </Can>
        <Button variant="outline" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </main>
  )
}
