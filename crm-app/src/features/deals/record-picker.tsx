import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Picked } from './schemas'

export type PickerOption = Picked & { hint?: string }

/**
 * Choose one record by searching for it (a company or a contact). Shows the choice with a button
 * to clear it; until then, results for what has been typed so far.
 */
export function RecordPicker({
  name,
  label,
  value,
  onChange,
  search,
}: {
  /** Distinguishes this picker's searches from other pickers'. */
  name: string
  label: string
  value: Picked | null
  onChange: (value: Picked | null) => void
  search: (q: string) => Promise<PickerOption[]>
}) {
  const listId = useId()
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  // Wait for a pause in typing before asking the server.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250)
    return () => clearTimeout(t)
  }, [text])

  const results = useQuery({
    queryKey: ['record-picker', name, q],
    queryFn: () => search(q),
    enabled: open && !value,
  })

  if (value) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input px-3 text-sm">
        <span className="truncate" aria-label={label}>
          {value.label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mr-2 h-7"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => {
            onChange(null)
            setText('')
            setQ('')
          }}
        >
          <X />
        </Button>
      </div>
    )
  }

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <Input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        placeholder="Search…"
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={`${label} results`}
          // Safari and Firefox on macOS do not focus a button when it is clicked, so the search box
          // would lose focus and close this list before the click lands. Keep focus where it is.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {results.isError ? (
            <p className="p-2 text-sm text-destructive">Could not search</p>
          ) : results.isPending ? (
            <p className="p-2 text-sm text-muted-foreground">Searching…</p>
          ) : results.data.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">No matches</p>
          ) : (
            results.data.map((o) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full flex-col rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                onClick={() => {
                  onChange({ id: o.id, label: o.label })
                  setOpen(false)
                }}
              >
                <span>{o.label}</span>
                {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
