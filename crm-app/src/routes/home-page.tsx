import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { useUiStore } from '@/store/ui-store'

const schema = z.object({ search: z.string().min(1, 'Required') })
type FormValues = z.infer<typeof schema>

export function HomePage() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">CRM</h1>
      <p className="text-muted-foreground">Sidebar: {sidebarOpen ? 'open' : 'closed'}</p>
      <form onSubmit={handleSubmit(() => {})} className="mt-4 flex gap-2">
        <input
          {...register('search')}
          placeholder="Search"
          className="h-9 flex-1 rounded-md border px-3 text-sm"
        />
        <Button type="submit">Search</Button>
      </form>
      {formState.errors.search && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {formState.errors.search.message}
        </p>
      )}
    </main>
  )
}
