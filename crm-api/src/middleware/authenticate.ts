import type { RequestHandler } from 'express'

import { HttpError } from '../lib/http-error.js'
import { verifyToken } from '../lib/jwt.js'

declare module 'express-serve-static-core' {
  interface Request {
    auth?: { userId: string; role: string }
  }
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Authentication required')
  try {
    const payload = verifyToken(header.slice(7))
    req.auth = { userId: payload.sub, role: payload.role }
    next()
  } catch {
    throw new HttpError(401, 'Invalid or expired token')
  }
}
