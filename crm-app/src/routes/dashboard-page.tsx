import { useAuthStore } from '@/store/auth-store'

// Placeholder until the real dashboard (US-012 – US-015).
export function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground">
        Welcome, {user?.firstName} {user?.lastName} ({user?.role})
      </p>
    </div>
  )
}
