import { api } from '@/api/client'

export type Company = {
  id: string
  name: string
  industry: string | null
  employees: number | null
  /** Annual, in USD. */
  revenue: number | null
  website: string | null
  owner: { id: string; firstName: string; lastName: string } | null
  contactCount: number
  dealCount: number
}

export type NewCompany = {
  name: string
  industry?: string
  employees?: number
  revenue?: number
  website?: string
}

/** On update, `null` clears an optional field and a missing field is left alone. */
export type CompanyUpdate = {
  name: string
  industry: string | null
  employees: number | null
  revenue: number | null
  website: string | null
}

export type CompaniesPage = { companies: Company[]; total: number; page: number; pageSize: number }

export const listCompanyDetails = (params: { q?: string; page?: number; pageSize?: number }) =>
  api.get<CompaniesPage>('/companies/details', { params }).then((r) => r.data)

export const getCompany = (id: string) =>
  api.get<{ company: Company }>(`/companies/${id}`).then((r) => r.data.company)

export const createCompany = (body: NewCompany) =>
  api.post<{ company: Company }>('/companies', body).then((r) => r.data.company)

export const updateCompany = (id: string, body: CompanyUpdate) =>
  api.patch<{ company: Company }>(`/companies/${id}`, body).then((r) => r.data.company)
