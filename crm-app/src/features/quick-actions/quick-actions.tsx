import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { usePermission } from '@/hooks/use-permission'
import { QUICK_ACTIONS, type QuickAction } from './actions'
import { QuickCreateDialog } from './quick-create-dialog'

function QuickActionButton({ action }: { action: QuickAction }) {
  const [open, setOpen] = useState(false)
  const allowed = usePermission(action.permission)
  if (!allowed) return null
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <action.icon /> {action.label}
      </Button>
      <QuickCreateDialog action={action} open={open} onOpenChange={setOpen} />
    </>
  )
}

/** One-click shortcuts to create records; each button shows only if the role may write it. */
export function QuickActions() {
  return (
    <div role="group" aria-label="Quick actions" className="flex flex-wrap gap-2">
      {QUICK_ACTIONS.map((a) => (
        <QuickActionButton key={a.type} action={a} />
      ))}
    </div>
  )
}
