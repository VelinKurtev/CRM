import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Target } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { DealForm } from '@/features/deals/deal-form'
import { refreshDeals } from '@/features/deals/invalidate'
import { emptyDeal, toNewDeal } from '@/features/deals/schemas'
import { listPipelines } from '@/services/deals'
import { CONVERTIBLE_LEAD_STAGES } from '@/services/lead-options'
import { convertLead, getLead } from '@/services/leads'
import { STATUS_LABELS } from './schemas'

/** Turn a qualified lead into a deal: the deal form, already filled in from the lead. */
export function ConvertLeadPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => getLead(id), retry: false })
  const pipelines = useQuery({ queryKey: ['deals', 'pipelines'], queryFn: listPipelines })

  const back = (
    <Button variant="outline" onClick={() => navigate('/leads')}>
      Back to leads
    </Button>
  )

  if (lead.isPending || pipelines.isPending) {
    return <Skeleton className="mx-auto h-96 max-w-3xl" aria-label="Loading lead" />
  }

  if (lead.isError || pipelines.isError) {
    const error = lead.error ?? pipelines.error
    const missing = axios.isAxiosError(error) && error.response?.status === 404
    return (
      <EmptyState
        icon={<Target className="size-10" />}
        title={missing ? 'Lead not found' : 'Could not load the lead'}
        description={
          missing ? 'It may have been removed.' : getErrorMessage(error, 'Please try again.')
        }
        action={back}
      />
    )
  }

  const { data } = lead
  if (data.deal) {
    return (
      <EmptyState
        icon={<Target className="size-10" />}
        title="This lead is already a deal"
        description={`${data.title} was converted to the deal “${data.deal.title}”.`}
        action={
          <Button asChild>
            <Link to={`/deals/${data.deal.id}/edit`}>Open the deal</Link>
          </Button>
        }
      />
    )
  }
  if (!CONVERTIBLE_LEAD_STAGES.includes(data.status)) {
    return (
      <EmptyState
        icon={<Target className="size-10" />}
        title="Only a qualified lead can be converted"
        description={`${data.title} is at “${STATUS_LABELS[data.status]}”. Move it to Qualified, Proposal Sent or Negotiation first.`}
        action={back}
      />
    )
  }

  // New deals start in the default pipeline, which the API lists first.
  const stages = pipelines.data[0]?.stages ?? []
  if (stages.length === 0) {
    return (
      <EmptyState
        icon={<Target className="size-10" />}
        title="There is no pipeline to add the deal to"
        description="Ask an admin to set one up."
        action={back}
      />
    )
  }

  const start = emptyDeal(stages[0].id, stages[0].probability)
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Convert {data.title} to a deal</h1>
        <p className="text-muted-foreground">
          Check the details. The lead’s notes and tags come with the deal, and the lead moves to
          Won.
        </p>
      </div>
      <DealForm
        defaultValues={{
          ...start,
          title: data.title,
          amount: data.value ? String(data.value) : '',
          contact: data.contact && {
            id: data.contact.id,
            label: `${data.contact.firstName} ${data.contact.lastName}`,
          },
        }}
        stages={stages}
        submitLabel="Convert to deal"
        save={(values) => convertLead(id, toNewDeal(values))}
        onSaved={({ deal }) => {
          toast.success(`${data.title} is now a deal`)
          void refreshDeals(queryClient)
          void queryClient.invalidateQueries({ queryKey: ['leads'] })
          void queryClient.invalidateQueries({ queryKey: ['lead', id] })
          navigate(`/deals/${deal.id}/edit`)
        }}
        onCancel={() => navigate(-1)}
      />
    </div>
  )
}
