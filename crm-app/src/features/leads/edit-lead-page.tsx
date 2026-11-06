import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { ArrowRightLeft, Target } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission } from '@/hooks/use-permission'
import { CONVERTIBLE_LEAD_STAGES } from '@/services/lead-options'
import { getLead, updateLead } from '@/services/leads'
import { LeadAttachments } from './lead-attachments'
import { LeadForm } from './lead-form'
import { fromLead, toLeadUpdate } from './schemas'

export function EditLeadPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canAssign = usePermission('leads:assign')
  const canWriteDeals = usePermission('deals:write')
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => getLead(id),
    retry: false,
  })

  if (isPending) return <Skeleton className="mx-auto h-96 max-w-3xl" aria-label="Loading lead" />

  if (isError) {
    const missing = axios.isAxiosError(error) && error.response?.status === 404
    return (
      <EmptyState
        icon={<Target className="size-10" />}
        title={missing ? 'Lead not found' : 'Could not load the lead'}
        description={
          missing ? 'It may have been removed.' : getErrorMessage(error, 'Please try again.')
        }
        action={
          <Button variant="outline" onClick={() => navigate('/leads')}>
            Back to leads
          </Button>
        }
      />
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Edit {data.title}</h1>
          <p className="text-muted-foreground">Clear a field to remove its value.</p>
        </div>
        {canWriteDeals && !data.deal && CONVERTIBLE_LEAD_STAGES.includes(data.status) && (
          <Button asChild variant="outline">
            <Link to={`/leads/${id}/convert`}>
              <ArrowRightLeft /> Convert to deal
            </Link>
          </Button>
        )}
        {data.deal && (
          <p className="text-sm text-muted-foreground">
            Converted to{' '}
            {canWriteDeals ? (
              <Link to={`/deals/${data.deal.id}/edit`} className="underline">
                {data.deal.title}
              </Link>
            ) : (
              data.deal.title
            )}
          </p>
        )}
      </div>
      <LeadForm
        defaultValues={fromLead(data)}
        submitLabel="Save changes"
        noOwnerLabel="Nobody"
        save={(values) => updateLead(id, toLeadUpdate(values, canAssign))}
        onSaved={(lead) => {
          toast.success(`${lead.title} was updated`)
          void queryClient.invalidateQueries({ queryKey: ['lead', id] })
          void queryClient.invalidateQueries({ queryKey: ['leads'] })
          void queryClient.invalidateQueries({
            predicate: (q) => String(q.queryKey[0]).startsWith('dashboard'),
          })
          navigate('/leads')
        }}
        onCancel={() => navigate(-1)}
      />
      <LeadAttachments leadId={id} />
    </div>
  )
}
