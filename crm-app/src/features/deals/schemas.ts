import { z } from 'zod'

import type { Deal, DealStatus, DealUpdate, NewDeal } from '@/services/deals'

export const STATUS_LABELS: Record<DealStatus, string> = {
  OPEN: 'Open',
  WON: 'Won',
  LOST: 'Lost',
}

/** A company or contact chosen for the deal. */
export type Picked = { id: string; label: string }
const picked = z.object({ id: z.string(), label: z.string() }).nullable()

const isRealDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export const dealSchema = z.object({
  title: z.string().trim().min(1, 'Name is required').max(200, 'Keep it under 200 characters'),
  company: picked,
  contact: picked,
  amount: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+(\.\d{1,2})?$/.test(v), 'Enter an amount, e.g. 15000.50')
    .refine((v) => Number(v) <= 999_999_999_999, 'That value is too large'),
  stageId: z.string().min(1, 'Choose a stage'),
  probability: z
    .string()
    .trim()
    .min(1, 'Probability is required')
    .refine((v) => /^\d+$/.test(v), 'Enter a whole number from 0 to 100')
    .refine((v) => Number(v) <= 100, 'Probability cannot be above 100'),
  expectedClose: z
    .string()
    .trim()
    .refine((v) => v === '' || isRealDate(v), 'Enter a valid date'),
})
export type DealFormValues = z.infer<typeof dealSchema>

/** What a new deal starts with: the chosen stage and its probability. */
export const emptyDeal = (stageId: string, probability: number): DealFormValues => ({
  title: '',
  company: null,
  contact: null,
  amount: '',
  stageId,
  probability: String(probability),
  expectedClose: '',
})

/** The API body: blank optional fields are left out. */
export function toNewDeal(v: DealFormValues): NewDeal {
  const body: NewDeal = {
    title: v.title.trim(),
    stageId: v.stageId,
    probability: Number(v.probability),
  }
  if (v.amount.trim()) body.amount = Number(v.amount)
  if (v.expectedClose.trim()) body.expectedClose = v.expectedClose.trim()
  if (v.company) body.companyId = v.company.id
  if (v.contact) body.contactId = v.contact.id
  return body
}

/** The update body: blank optional fields become `null`, which clears them on the server. */
export function toDealUpdate(v: DealFormValues): DealUpdate {
  return {
    title: v.title.trim(),
    amount: v.amount.trim() ? Number(v.amount) : 0,
    stageId: v.stageId,
    probability: Number(v.probability),
    expectedClose: v.expectedClose.trim() || null,
    companyId: v.company?.id ?? null,
    contactId: v.contact?.id ?? null,
  }
}

export function fromDeal(d: Deal): DealFormValues {
  return {
    title: d.title,
    company: d.company && { id: d.company.id, label: d.company.name },
    contact: d.contact && {
      id: d.contact.id,
      label: `${d.contact.firstName} ${d.contact.lastName}`,
    },
    amount: d.amount ? String(d.amount) : '',
    stageId: d.stage.id,
    probability: String(d.probability),
    expectedClose: d.expectedClose?.slice(0, 10) ?? '',
  }
}
