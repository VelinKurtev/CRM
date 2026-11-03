import rateLimit from 'express-rate-limit'

import { config } from '../config.js'

type Options = { windowMs?: number; limit?: number; enforceInTests?: boolean }

/**
 * Per-IP request cap for abuse-prone endpoints. Responds with the standard JSON error shape.
 * Off under test (the suites sign in far more often than a person would) unless a test opts in.
 */
export const createLimiter = ({
  windowMs = 15 * 60_000,
  limit = 20,
  enforceInTests = false,
}: Options = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => config.NODE_ENV === 'test' && !enforceInTests,
    handler: (_req, res) => {
      res.status(429).json({ error: { message: 'Too many attempts. Please try again later.' } })
    },
  })

/** Sign-in, sign-up and password-reset endpoints: 20 requests per 15 minutes per IP. */
export const authLimiter = createLimiter()
