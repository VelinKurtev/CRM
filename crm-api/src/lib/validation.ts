import { z } from 'zod'

/** An http(s) URL, e.g. an avatar or a social profile. */
export const httpUrl = z
  .url('Enter a valid URL')
  .max(500)
  .refine((v) => /^https?:\/\//i.test(v), 'URL must start with http:// or https://')

/** Required, trimmed text. */
export const requiredText = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required`).max(max)

/** Optional trimmed text (omit the field to leave it empty). */
export const optionalText = (max = 200) => z.string().trim().max(max).optional()
