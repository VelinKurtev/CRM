import { useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'

import { initAuth } from '@/features/auth/session'
import { Toaster } from '@/components/ui/sonner'
import { router } from '@/routes'
import { queryClient } from './query-client'

export default function App() {
  useEffect(() => {
    void initAuth()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  )
}
