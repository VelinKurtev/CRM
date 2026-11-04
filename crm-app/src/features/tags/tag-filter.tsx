import { Tag } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type Props = {
  /** Every tag that can be picked. */
  options: string[]
  value: string[]
  mode: 'any' | 'all'
  onChange: (value: string[], mode: 'any' | 'all') => void
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Pick one or more tags to filter by, and whether a contact needs any of them or all of them. */
export function TagFilter({ options, value, mode, onChange }: Props) {
  const [search, setSearch] = useState('')
  // A tag from a shared link may not be among the options (e.g. over the 100 shown): keep it.
  const all = [...options, ...value.filter((v) => !options.some((o) => same(o, v)))]
  const shown = all.filter((t) => t.toLowerCase().includes(search.trim().toLowerCase()))
  const selected = (tag: string) => value.some((v) => same(v, tag))

  const toggle = (tag: string) =>
    onChange(selected(tag) ? value.filter((v) => !same(v, tag)) : [...value, tag], mode)

  return (
    <Popover onOpenChange={(open) => !open && setSearch('')}>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label="Tags" className="w-40 justify-start font-normal">
          <Tag aria-hidden />
          <span className="truncate">
            {value.length === 0 ? 'Tags' : value.length === 1 ? value[0] : `${value.length} tags`}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a tag…"
          aria-label="Find a tag"
        />
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags found.</p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label="Tags">
            {shown.map((tag) => (
              <li key={tag}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                  <input type="checkbox" checked={selected(tag)} onChange={() => toggle(tag)} />
                  {tag}
                </label>
              </li>
            ))}
          </ul>
        )}
        {value.length > 1 && (
          <fieldset className="space-y-1 border-t pt-3">
            <legend className="sr-only">Match</legend>
            <p className="text-xs text-muted-foreground">Show contacts that have…</p>
            {(['any', 'all'] as const).map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="tag-mode"
                  checked={mode === m}
                  onChange={() => onChange(value, m)}
                />
                {m === 'any' ? 'any of these tags' : 'all of these tags'}
              </label>
            ))}
          </fieldset>
        )}
        {value.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange([], 'any')}>
            Clear tags
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
