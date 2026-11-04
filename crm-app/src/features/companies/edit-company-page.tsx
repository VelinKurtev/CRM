import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Building2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { getCompany, updateCompany } from '@/services/companies'
import { CompanyForm } from './company-form'
import { fromCompany, toCompanyUpdate } from './schemas'

export function EditCompanyPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['company', id],
    queryFn: () => getCompany(id),
    retry: false,
  })

  if (isPending) return <Skeleton className="mx-auto h-72 max-w-3xl" aria-label="Loading company" />

  if (isError) {
    const missing = axios.isAxiosError(error) && error.response?.status === 404
    return (
      <EmptyState
        icon={<Building2 className="size-10" />}
        title={missing ? 'Company not found' : 'Could not load the company'}
        description={
          missing ? 'It may have been removed.' : getErrorMessage(error, 'Please try again.')
        }
        action={
          <Button variant="outline" onClick={() => navigate('/companies')}>
            Back to companies
          </Button>
        }
      />
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Edit {data.name}</h1>
        <p className="text-muted-foreground">Clear a field to remove its value.</p>
      </div>
      <CompanyForm
        defaultValues={fromCompany(data)}
        submitLabel="Save changes"
        save={(values) => updateCompany(id, toCompanyUpdate(values))}
        onSaved={(company) => {
          toast.success(`${company.name} was updated`)
          void queryClient.invalidateQueries({ queryKey: ['company', id] })
          void queryClient.invalidateQueries({ queryKey: ['companies'] })
          void queryClient.invalidateQueries({ queryKey: ['company-suggestions'] })
          void queryClient.invalidateQueries({ queryKey: ['contact-filter-companies'] })
          void queryClient.invalidateQueries({ queryKey: ['company', id, 'overview'] })
          navigate(`/companies/${id}`)
        }}
        onCancel={() => navigate(-1)}
      />
    </div>
  )
}
