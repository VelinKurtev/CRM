import type { ErrorRequestHandler, RequestHandler } from 'express'

import { HttpError } from '../lib/http-error.js'

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'Not found'))
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { message: err.message, details: err.details } })
    return
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { message: 'Invalid JSON body' } })
    return
  }
  console.error(err)
  res.status(500).json({ error: { message: 'Internal server error' } })
}
