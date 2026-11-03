import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth-store'

// Placeholder until the real dashboard (US-011 – US-015).
export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground">
        Welcome, {user?.firstName} {user?.lastName} ({user?.role})
      </p>
      <Button
        variant="outline"
        className="mt-4"
        onClick={() => {
          logout()
          navigate('/login', { replace: true })
        }}
      >
        Sign out
      </Button>
    </main>
  )
}
