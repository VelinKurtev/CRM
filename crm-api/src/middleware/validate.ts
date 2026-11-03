import type { RequestHandler } from 'express'
import type { z, ZodType } from 'zod'

import { HttpError } from '../lib/http-error.js'

/** Validates `req.body` against a Zod schema and replaces it with the parsed value. */
export const validateBody =
  (schema: ZodType): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const fields = Object.fromEntries(
        result.error.issues.map((i) => [i.path.join('.') || '_', i.message]),
      )
      throw new HttpError(400, 'Validation failed', fields)
    }
    req.body = result.data
    next()
  }

/** Parse `req.query` against a Zod schema, or throw a 400 with per-field errors. */
export function parseQuery<T extends ZodType>(schema: T, query: unknown): z.infer<T> {
  const result = schema.safeParse(query)
  if (!result.success) {
    const fields = Object.fromEntries(
      result.error.issues.map((i) => [i.path.join('.') || '_', i.message]),
    )
    throw new HttpError(400, 'Invalid query', fields)
  }
  return result.data
}
