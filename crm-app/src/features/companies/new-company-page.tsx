import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { createCompany } from '@/services/companies'
import { CompanyForm } from './company-form'
import { emptyCompany, toNewCompany } from './schemas'

export function NewCompanyPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New company</h1>
        <p className="text-muted-foreground">Only the name is required.</p>
      </div>
      <CompanyForm
        defaultValues={emptyCompany}
        submitLabel="Create company"
        save={(values) => createCompany(toNewCompany(values))}
        onSaved={(company) => {
          toast.success(`${company.name} was added`)
          void queryClient.invalidateQueries({ queryKey: ['companies'] })
          void queryClient.invalidateQueries({ queryKey: ['company-suggestions'] })
          navigate('/companies')
        }}
        onCancel={() => navigate(-1)}
      />
    </div>
  )
}
