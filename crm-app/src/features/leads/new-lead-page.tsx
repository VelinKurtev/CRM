import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { createLead } from '@/services/leads'
import { LeadForm } from './lead-form'
import { emptyLead, toNewLead } from './schemas'

export function NewLeadPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New lead</h1>
        <p className="text-muted-foreground">Only the title is required.</p>
      </div>
      <LeadForm
        defaultValues={emptyLead()}
        submitLabel="Create lead"
        noOwnerLabel="Me"
        save={(values) => createLead(toNewLead(values))}
        onSaved={(lead) => {
          toast.success(`${lead.title} was added`)
          void queryClient.invalidateQueries({ queryKey: ['leads'] })
          void queryClient.invalidateQueries({
            predicate: (q) => String(q.queryKey[0]).startsWith('dashboard'),
          })
          navigate('/leads')
        }}
        onCancel={() => navigate(-1)}
      />
    </div>
  )
}
