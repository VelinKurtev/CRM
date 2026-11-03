import { ListPlus, Target, UserPlus, Wallet, type LucideIcon } from 'lucide-react'
import { z } from 'zod'

import type { QuickRecord } from '@/services/records'

export type Field = {
  name: string
  label: string
  type?: 'text' | 'email' | 'tel' | 'number' | 'date'
  placeholder?: string
}

export type QuickAction = {
  type: QuickRecord
  label: string
  /** Shown only to users with this permission. */
  permission: string
  icon: LucideIcon
  fields: Field[]
  schema: z.ZodType<Record<string, string>, Record<string, string>>
  /** Turn the form's strings into the API body: empty fields are left out. */
  toBody: (values: Record<string, string>) => Record<string, unknown>
}

const required = (label: string) => z.string().trim().min(1, `${label} is required`)
const optional = z.string().trim()
const optionalEmail = z.union([z.literal(''), z.email('Enter a valid email')])
const optionalAmount = z
  .string()
  .trim()
  .refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), 'Enter a valid amount')

const compact = (values: Record<string, string>, numbers: string[] = []) =>
  Object.fromEntries(
    Object.entries(values)
      .map(([k, v]) => [k, v.trim()] as const)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => [k, numbers.includes(k) ? Number(v) : v]),
  )

export const QUICK_ACTIONS: QuickAction[] = [
  {
    type: 'contact',
    label: 'Add contact',
    permission: 'contacts:write',
    icon: UserPlus,
    fields: [
      { name: 'firstName', label: 'First name' },
      { name: 'lastName', label: 'Last name' },
      { name: 'email', label: 'Email (optional)', type: 'email' },
      { name: 'phone', label: 'Phone (optional)', type: 'tel' },
    ],
    schema: z.object({
      firstName: required('First name'),
      lastName: required('Last name'),
      email: optionalEmail,
      phone: optional,
    }),
    toBody: (v) => compact(v),
  },
  {
    type: 'lead',
    label: 'Add lead',
    permission: 'leads:write',
    icon: Target,
    fields: [
      { name: 'title', label: 'Title' },
      { name: 'source', label: 'Source (optional)', placeholder: 'Website, referral…' },
    ],
    schema: z.object({ title: required('Title'), source: optional }),
    toBody: (v) => compact(v),
  },
  {
    type: 'deal',
    label: 'Add deal',
    permission: 'deals:write',
    icon: Wallet,
    fields: [
      { name: 'title', label: 'Title' },
      { name: 'amount', label: 'Value in USD (optional)', type: 'number' },
      { name: 'expectedClose', label: 'Expected close (optional)', type: 'date' },
    ],
    schema: z.object({ title: required('Title'), amount: optionalAmount, expectedClose: optional }),
    toBody: (v) => compact(v, ['amount']),
  },
  {
    type: 'task',
    label: 'Add task',
    permission: 'tasks:write',
    icon: ListPlus,
    fields: [
      { name: 'title', label: 'Title' },
      { name: 'dueDate', label: 'Due date (optional)', type: 'date' },
    ],
    schema: z.object({ title: required('Title'), dueDate: optional }),
    toBody: (v) => compact(v),
  },
]
