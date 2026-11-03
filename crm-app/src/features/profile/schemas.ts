import { z } from 'zod'

export const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  avatarUrl: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Enter a valid http(s) URL'),
})

export type ProfileValues = z.infer<typeof profileSchema>
