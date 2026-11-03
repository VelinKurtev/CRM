import { LogOut, Menu, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { signOut } from '@/features/auth/session'
import { useAuthStore } from '@/store/auth-store'

export function Navbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return null
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
      <Button variant="ghost" size="icon" onClick={onToggleSidebar} aria-label="Toggle sidebar">
        <Menu />
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="gap-2" aria-label="User menu">
            <Avatar className="size-7">
              {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden text-sm sm:inline">
              {user.firstName} {user.lastName}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{user.email}</div>
          <Button asChild variant="ghost" className="w-full justify-start">
            <Link to="/profile">
              <UserRound /> My profile
            </Link>
          </Button>
          <Button variant="ghost" className="w-full justify-start" onClick={() => void signOut()}>
            <LogOut /> Sign out
          </Button>
        </PopoverContent>
      </Popover>
    </header>
  )
}
