import type { QueryClient } from '@tanstack/react-query'

/** A deal shows up on its company's and contact's pages and in the dashboard figures too. */
export function refreshDeals(queryClient: QueryClient) {
  const affected = ['deals', 'deal', 'company', 'contact']
  return queryClient.invalidateQueries({
    predicate: (q) => {
      const key = String(q.queryKey[0])
      return affected.includes(key) || key.startsWith('dashboard')
    },
  })
}
