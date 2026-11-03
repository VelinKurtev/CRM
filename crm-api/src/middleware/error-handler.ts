import type { ErrorRequestHandler, RequestHandler } from 'express'

import { HttpError } from '../lib/http-error.js'

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'Not found'))
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { message: err.message, details: err.details } })
    return
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { message: 'Invalid JSON body' } })
    return
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: { message: 'Request body too large' } })
    return
  }
  // Details go to the log (with the request id); the client only ever sees a generic message.
  req.log.error({ err }, 'Unhandled error')
  res.status(500).json({ error: { message: 'Internal server error' } })
}
