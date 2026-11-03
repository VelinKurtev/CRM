import { z } from 'zod'

import type { ContactDetail, ContactUpdate, NewContact } from '@/services/contacts'

const required = (label: string) => z.string().trim().min(1, `${label} is required`).max(100)
const text = (max = 200) => z.string().trim().max(max, `Keep it under ${max} characters`)
const optionalUrl = z
  .string()
  .trim()
  .refine(
    (v) => v === '' || (/^https?:\/\//i.test(v) && URL.canParse(v)),
    'Enter a full link starting with http:// or https://',
  )

export const contactSchema = z.object({
  firstName: required('First name'),
  lastName: required('Last name'),
  jobTitle: text(100),
  email: z.union([z.literal(''), z.string().trim().pipe(z.email('Enter a valid email'))]),
  phone: text(50),
  company: text(200),
  address: text(200),
  city: text(100),
  postalCode: text(20),
  country: text(100),
  linkedinUrl: optionalUrl,
  twitterUrl: optionalUrl,
  facebookUrl: optionalUrl,
  tags: z.array(z.string()).max(20, 'At most 20 tags'),
  note: text(5000),
})
export type ContactFormValues = z.infer<typeof contactSchema>

export const emptyContact: ContactFormValues = {
  firstName: '',
  lastName: '',
  jobTitle: '',
  email: '',
  phone: '',
  company: '',
  address: '',
  city: '',
  postalCode: '',
  country: '',
  linkedinUrl: '',
  twitterUrl: '',
  facebookUrl: '',
  tags: [],
  note: '',
}

/** The API body: blank fields are left out. */
export function toNewContact(values: ContactFormValues): NewContact {
  const { tags, ...rest } = values
  const body = Object.fromEntries(
    Object.entries(rest)
      .map(([k, v]) => [k, v.trim()] as const)
      .filter(([, v]) => v !== ''),
  ) as unknown as NewContact
  if (tags.length > 0) body.tags = tags
  return body
}

/** The update body: blank optional fields become `null`, which clears them on the server. */
export function toContactUpdate(values: ContactFormValues): ContactUpdate {
  const orNull = (v: string) => v.trim() || null
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: orNull(values.email),
    phone: orNull(values.phone),
    jobTitle: orNull(values.jobTitle),
    company: orNull(values.company),
    address: orNull(values.address),
    city: orNull(values.city),
    postalCode: orNull(values.postalCode),
    country: orNull(values.country),
    linkedinUrl: orNull(values.linkedinUrl),
    twitterUrl: orNull(values.twitterUrl),
    facebookUrl: orNull(values.facebookUrl),
    tags: values.tags,
  }
}

/** Form values for an existing contact (missing values become empty strings). */
export function fromContact(c: ContactDetail): ContactFormValues {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    jobTitle: c.jobTitle ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    company: c.company?.name ?? '',
    address: c.address ?? '',
    city: c.city ?? '',
    postalCode: c.postalCode ?? '',
    country: c.country ?? '',
    linkedinUrl: c.linkedinUrl ?? '',
    twitterUrl: c.twitterUrl ?? '',
    facebookUrl: c.facebookUrl ?? '',
    tags: c.tags,
    note: '',
  }
}
