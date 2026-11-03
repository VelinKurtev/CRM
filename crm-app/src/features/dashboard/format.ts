const full = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
const compact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const formatMoney = (n: number) => full.format(n)
export const formatMoneyCompact = (n: number) => compact.format(n)

/** `'2026-03'` → a local date on the 1st of that month. */
export const monthDate = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

export const monthLong = (key: string) =>
  monthDate(key).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

/** "Mar", with a two-digit year on the first tick and every January so the span is clear. */
export function monthTick(key: string, index: number) {
  const d = monthDate(key)
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  return index === 0 || d.getMonth() === 0 ? `${month} ’${String(d.getFullYear()).slice(2)}` : month
}

/** Round a maximum up to a clean axis top and return evenly spaced ticks from 0. */
export function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0]
  const rough = max / count
  const pow = 10 ** Math.floor(Math.log10(rough))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= rough) ?? 10) * pow
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step)
}
