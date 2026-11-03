import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import type { RevenueMonth } from '@/services/dashboard'
import { formatMoney, formatMoneyCompact, monthLong, monthTick, niceTicks } from './format'

const HEIGHT = 260
const M = { top: 20, right: 64, bottom: 30, left: 52 }

/** Width of an element, kept up to date as it resizes. Falls back to `initial` (tests, SSR). */
function useWidth(initial = 640) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

export function RevenueChart({ months }: { months: RevenueMonth[] }) {
  const { ref, width } = useWidth()
  const [active, setActive] = useState<number | null>(null)

  const n = months.length
  const ticks = niceTicks(Math.max(...months.map((m) => m.revenue)))
  const top = ticks[ticks.length - 1]
  const innerW = width - M.left - M.right
  const innerH = HEIGHT - M.top - M.bottom
  const x = (i: number) => M.left + (n > 1 ? (i * innerW) / (n - 1) : innerW / 2)
  const y = (v: number) => M.top + innerH - (top > 0 ? (v / top) * innerH : 0)

  const points = months.map((m, i) => `${x(i)},${y(m.revenue)}`)
  const line = `M${points.join('L')}`
  const area = `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`
  const last = months[n - 1]
  const compactAxis = top >= 10_000
  const tickEvery = width < 480 ? 2 : 1 // thin the month labels on narrow screens

  /** Snap the pointer to the nearest month. */
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * width
    const i = Math.round(((px - M.left) / innerW) * (n - 1))
    setActive(Math.min(n - 1, Math.max(0, i)))
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setActive((a) => Math.min(n - 1, (a ?? -1) + 1))
    else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? n) - 1))
    else if (e.key === 'Escape') setActive(null)
    else return
    e.preventDefault()
  }

  const hit = active === null ? null : months[active]

  return (
    <div ref={ref} className="relative">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Monthly revenue won, last ${n} months. Latest month ${formatMoney(last.revenue)}. Use the arrow keys to read each month.`}
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        className="block touch-pan-y rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
      >
        {/* Recessive hairline grid + y labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="stroke-border" />
            <text
              x={M.left - 8}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-xs"
            >
              {compactAxis ? formatMoneyCompact(t) : formatMoney(t)}
            </text>
          </g>
        ))}

        {months.map((m, i) =>
          i % tickEvery === (n - 1) % tickEvery ? (
            <text
              key={m.month}
              x={x(i)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-xs"
            >
              {monthTick(m.month, i)}
            </text>
          ) : null,
        )}

        <path d={area} style={{ fill: 'var(--viz-series-1)' }} opacity={0.1} />
        <path
          d={line}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ stroke: 'var(--viz-series-1)' }}
        />

        {/* Direct label on the latest month only */}
        <text
          x={x(n - 1) + 12}
          y={y(last.revenue)}
          dominantBaseline="middle"
          className="fill-foreground text-xs font-medium"
        >
          {formatMoneyCompact(last.revenue)}
        </text>

        {hit && (
          <line
            x1={x(active!)}
            x2={x(active!)}
            y1={M.top}
            y2={y(0)}
            className="stroke-muted-foreground"
          />
        )}
        {/* End dot, or the hovered month's dot; 2px ring in the card colour keeps it legible */}
        {[hit ? active! : n - 1].map((i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(months[i].revenue)}
            r={5}
            strokeWidth={2}
            style={{ fill: 'var(--viz-series-1)', stroke: 'var(--card)' }}
          />
        ))}
      </svg>

      {hit && (
        <div
          role="status"
          className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md"
          style={{
            left: x(active!) > width / 2 ? undefined : x(active!) + 12,
            right: x(active!) > width / 2 ? width - x(active!) + 12 : undefined,
          }}
        >
          <div className="text-xs text-muted-foreground">{monthLong(hit.month)}</div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="h-0.5 w-3 rounded-full"
              style={{ background: 'var(--viz-series-1)' }}
              aria-hidden
            />
            <span className="font-semibold">{formatMoney(hit.revenue)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {hit.deals} {hit.deals === 1 ? 'deal' : 'deals'} won
          </div>
        </div>
      )}
    </div>
  )
}
