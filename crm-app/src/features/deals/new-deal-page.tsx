import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Handshake } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { createDeal, listPipelines } from '@/services/deals'
import { DealForm } from './deal-form'
import { refreshDeals } from './invalidate'
import { emptyDeal, toNewDeal } from './schemas'

export function NewDealPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const pipelines = useQuery({ queryKey: ['deals', 'pipelines'], queryFn: listPipelines })

  if (pipelines.isPending) {
    return <Skeleton className="mx-auto h-96 max-w-3xl" aria-label="Loading stages" />
  }
  // New deals go into the default pipeline, which the API lists first.
  const stages = pipelines.data?.[0]?.stages ?? []
  if (pipelines.isError || stages.length === 0) {
    return (
      <EmptyState
        icon={<Handshake className="size-10" />}
        title="Could not load the deal stages"
        description={getErrorMessage(pipelines.error, 'There is no pipeline to add the deal to.')}
        action={
          <Button variant="outline" onClick={() => navigate('/deals')}>
            Back to deals
          </Button>
        }
      />
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New deal</h1>
        <p className="text-muted-foreground">Only the name is required.</p>
      </div>
      <DealForm
        defaultValues={emptyDeal(stages[0].id, stages[0].probability)}
        stages={stages}
        submitLabel="Create deal"
        save={(values) => createDeal(toNewDeal(values))}
        onSaved={(deal) => {
          toast.success(`${deal.title} was added`)
          void refreshDeals(queryClient)
          navigate('/deals')
        }}
        onCancel={() => navigate(-1)}
      />
    </div>
  )
}
