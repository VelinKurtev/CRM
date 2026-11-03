import { SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/utils/cn'

type SearchInputProps = {
  value?: string
  onSearch: (query: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
}

/** Search box that reports the query after the user stops typing. */
export function SearchInput({
  value = '',
  onSearch,
  placeholder = 'Search…',
  debounceMs = 300,
  className,
}: SearchInputProps) {
  const [text, setText] = useState(value)
  const onSearchRef = useRef(onSearch)

  useEffect(() => {
    onSearchRef.current = onSearch
  })
  useEffect(() => setText(value), [value])

  useEffect(() => {
    if (text === value) return
    const id = setTimeout(() => onSearchRef.current(text), debounceMs)
    return () => clearTimeout(id)
  }, [text, value, debounceMs])

  return (
    <div className={cn('relative', className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        role="searchbox"
        aria-label={placeholder}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        className="pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setText('')
            onSearchRef.current('')
          }}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  )
}
