import { z } from 'zod'

import type { Company, CompanyUpdate, NewCompany } from '@/services/companies'

export const companySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200, 'Keep it under 200 characters'),
  industry: z.string().trim().max(100, 'Keep it under 100 characters'),
  employees: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+$/.test(v), 'Enter a whole number')
    .refine((v) => Number(v) <= 10_000_000, 'That is too many employees'),
  revenue: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+(\.\d{1,2})?$/.test(v), 'Enter an amount, e.g. 1250000.50')
    .refine((v) => Number(v) <= 1_000_000_000_000, 'That revenue is too large'),
  website: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^https?:\/\//i.test(v) && URL.canParse(v)),
      'Enter a full link starting with http:// or https://',
    ),
})
export type CompanyFormValues = z.infer<typeof companySchema>

export const emptyCompany: CompanyFormValues = {
  name: '',
  industry: '',
  employees: '',
  revenue: '',
  website: '',
}

/** The API body: blank fields are left out. */
export function toNewCompany(v: CompanyFormValues): NewCompany {
  const body: NewCompany = { name: v.name.trim() }
  if (v.industry.trim()) body.industry = v.industry.trim()
  if (v.employees.trim()) body.employees = Number(v.employees)
  if (v.revenue.trim()) body.revenue = Number(v.revenue)
  if (v.website.trim()) body.website = v.website.trim()
  return body
}

/** The update body: blank optional fields become `null`, which clears them on the server. */
export function toCompanyUpdate(v: CompanyFormValues): CompanyUpdate {
  return {
    name: v.name.trim(),
    industry: v.industry.trim() || null,
    employees: v.employees.trim() ? Number(v.employees) : null,
    revenue: v.revenue.trim() ? Number(v.revenue) : null,
    website: v.website.trim() || null,
  }
}

export function fromCompany(c: Company): CompanyFormValues {
  return {
    name: c.name,
    industry: c.industry ?? '',
    employees: c.employees === null ? '' : String(c.employees),
    revenue: c.revenue === null ? '' : String(c.revenue),
    website: c.website ?? '',
  }
}
