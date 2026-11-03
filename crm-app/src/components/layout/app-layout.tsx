import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { cn } from '@/utils/cn'
import { useUiStore } from '@/store/ui-store'
import { Breadcrumbs } from './breadcrumbs'
import { Footer } from './footer'
import { Navbar } from './navbar'
import { Brand, SidebarNav } from './sidebar'

const DESKTOP = '(min-width: 768px)'
const isDesktop = () => window.matchMedia(DESKTOP).matches

export function AppLayout() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => setMobileOpen(false), [pathname])
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  // Wide screens collapse/expand the sidebar; narrow screens open it as a drawer.
  const onToggle = () => (isDesktop() ? toggleSidebar() : setMobileOpen((o) => !o))

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside
        className={cn(
          'hidden shrink-0 border-r transition-[width] md:block',
          sidebarOpen ? 'w-60' : 'w-16',
        )}
      >
        <Brand collapsed={!sidebarOpen} />
        <SidebarNav collapsed={!sidebarOpen} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            aria-hidden
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-60 border-r bg-background">
            <Brand />
            <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar onToggleSidebar={onToggle} />
        <main className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
          <Breadcrumbs />
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  )
}
