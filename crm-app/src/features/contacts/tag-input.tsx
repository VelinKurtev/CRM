import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useDeferredValue, useId, useState, type KeyboardEvent } from 'react'

import { Input } from '@/components/ui/input'
import { searchTags } from '@/services/contacts'

type Props = {
  value: string[]
  onChange: (tags: string[]) => void
  id?: string
  max?: number
}

/** Type a tag and press Enter or comma to add it; suggestions come from existing tags. */
export function TagInput({ value, onChange, id, max = 20 }: Props) {
  const [text, setText] = useState('')
  const listId = useId()
  const q = useDeferredValue(text.trim())
  const { data: suggestions = [] } = useQuery({
    queryKey: ['tag-suggestions', q],
    queryFn: () => searchTags(q),
    staleTime: 30_000,
  })

  const add = (raw: string) => {
    const tag = raw.trim()
    setText('')
    if (!tag || value.length >= max) return
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) return
    onChange([...value, tag])
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault() // Enter must not submit the form
      add(text)
    } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Tags">
          {value.map((tag) => (
            <li
              key={tag}
              className="flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-3 text-sm"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => onChange(value.filter((t) => t !== tag))}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={text}
        list={listId}
        placeholder="Type a tag, press Enter"
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(text)}
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !value.some((t) => t.toLowerCase() === s.toLowerCase()))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  )
}
