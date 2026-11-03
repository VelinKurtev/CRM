import type { Request, RequestHandler } from 'express'

import { HttpError } from '../lib/http-error.js'
import { verifyToken } from '../lib/jwt.js'

declare module 'express-serve-static-core' {
  interface Request {
    auth?: { userId: string; role: string }
  }
}

/** Read and verify the bearer token, or throw a 401. */
export function readAuth(req: Request) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Authentication required')
  try {
    const payload = verifyToken(header.slice(7))
    return { userId: payload.sub, role: payload.role }
  } catch {
    throw new HttpError(401, 'Invalid or expired token')
  }
}

export const authenticate: RequestHandler = (req, _res, next) => {
  req.auth = readAuth(req)
  next()
}
