import { z } from 'zod'

import { httpUrl, optionalText, requiredText } from './validation.js'

export const optionalEmail = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'))
export const tagsSchema = z.array(requiredText('Tag', 50)).max(20, 'At most 20 tags')

/** What a new contact may contain. Shared by the create endpoint and the CSV import. */
export const createContactSchema = z.object({
  firstName: requiredText('First name', 100),
  lastName: requiredText('Last name', 100),
  email: optionalEmail.optional(),
  phone: optionalText(50),
  jobTitle: optionalText(100),
  /** Company name: links to an existing company (any letter case) or creates one. */
  company: optionalText(200),
  address: optionalText(200),
  city: optionalText(100),
  postalCode: optionalText(20),
  country: optionalText(100),
  linkedinUrl: httpUrl.optional(),
  twitterUrl: httpUrl.optional(),
  facebookUrl: httpUrl.optional(),
  tags: tagsSchema.optional(),
  /** Becomes the first note on the contact. */
  note: z.string().trim().min(1).max(5000).optional(),
})
