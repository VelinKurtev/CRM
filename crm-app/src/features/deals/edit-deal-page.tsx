import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Handshake } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { getDeal, listPipelines, updateDeal } from '@/services/deals'
import { DealForm } from './deal-form'
import { refreshDeals } from './invalidate'
import { fromDeal, toDealUpdate } from './schemas'

export function EditDealPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const deal = useQuery({ queryKey: ['deal', id], queryFn: () => getDeal(id), retry: false })
  const pipelines = useQuery({ queryKey: ['deals', 'pipelines'], queryFn: listPipelines })

  if (deal.isPending || pipelines.isPending) {
    return <Skeleton className="mx-auto h-96 max-w-3xl" aria-label="Loading deal" />
  }

  if (deal.isError || pipelines.isError) {
    const error = deal.error ?? pipelines.error
    const missing = axios.isAxiosError(error) && error.response?.status === 404
    return (
      <EmptyState
        icon={<Handshake className="size-10" />}
        title={missing ? 'Deal not found' : 'Could not load the deal'}
        description={
          missing ? 'It may have been removed.' : getErrorMessage(error, 'Please try again.')
        }
        action={
          <Button variant="outline" onClick={() => navigate('/deals')}>
            Back to deals
          </Button>
        }
      />
    )
  }

  // A deal can only move between the stages of its own pipeline.
  const stages = pipelines.data.find((p) => p.id === deal.data.pipelineId)?.stages ?? []

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Edit {deal.data.title}</h1>
        <p className="text-muted-foreground">Clear a field to remove its value.</p>
      </div>
      <DealForm
        defaultValues={fromDeal(deal.data)}
        stages={stages}
        submitLabel="Save changes"
        save={(values) => updateDeal(id, toDealUpdate(values))}
        onSaved={(saved) => {
          toast.success(`${saved.title} was updated`)
          void refreshDeals(queryClient)
          navigate('/deals')
        }}
        onCancel={() => navigate(-1)}
      />
    </div>
  )
}
