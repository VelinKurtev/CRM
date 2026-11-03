/** Page numbers to display, with `'ellipsis'` marking skipped ranges. */
export function getPageItems(
  page: number,
  pageCount: number,
  siblings = 1,
): (number | 'ellipsis')[] {
  const total = siblings * 2 + 5
  if (pageCount <= total) return Array.from({ length: pageCount }, (_, i) => i + 1)

  const left = Math.max(page - siblings, 2)
  const right = Math.min(page + siblings, pageCount - 1)
  const items: (number | 'ellipsis')[] = [1]
  if (left > 2) items.push('ellipsis')
  for (let p = left; p <= right; p++) items.push(p)
  if (right < pageCount - 1) items.push('ellipsis')
  items.push(pageCount)
  return items
}
