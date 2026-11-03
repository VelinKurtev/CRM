import pino from 'pino'

import { config } from '../config.js'

/** Structured JSON logs. Silent under test to keep output readable. */
export const logger = pino({
  level: config.LOG_LEVEL ?? (config.NODE_ENV === 'test' ? 'silent' : 'info'),
  // Never write credentials to logs, whatever route they arrive on.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
    ],
    censor: '[redacted]',
  },
})
