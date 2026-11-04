import type { CSSProperties } from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils/cn'

/** Black or white, whichever reads better on the colour (`#rrggbb`). */
function readableText(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  return luminance > 0.4 ? '#111827' : '#ffffff'
}

const colourStyle = (color: string | null | undefined): CSSProperties | undefined =>
  color ? { backgroundColor: color, color: readableText(color) } : undefined

type Props = {
  name: string
  color?: string | null
  /** Makes the tag a button, e.g. to filter by it. */
  onClick?: () => void
  className?: string
}

/** A tag as a pill, in its own colour if it has one. */
export function TagBadge({ name, color, onClick, className }: Props) {
  if (!onClick) {
    return (
      <Badge variant="secondary" style={colourStyle(color)} className={className}>
        {name}
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" asChild style={colourStyle(color)} className={className}>
      <button
        type="button"
        onClick={onClick}
        title={`Show contacts tagged ${name}`}
        className={cn('cursor-pointer hover:opacity-80', className)}
      >
        {name}
      </button>
    </Badge>
  )
}
