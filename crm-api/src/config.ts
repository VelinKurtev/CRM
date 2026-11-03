import 'dotenv/config'
import { z } from 'zod'

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().default(4000),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
    JWT_EXPIRES_IN: z.string().default('15m'),
    APP_URL: z.string().default('http://localhost:5173'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('CRM <no-reply@crm.local>'),
    RESET_TOKEN_TTL_MINUTES: z.coerce.number().default(60),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
    NODE_ENV: z.string().default('development'),
    /** pino level; defaults to `info`, or `silent` under test. */
    LOG_LEVEL: z.string().optional(),
    // Credentialed requests: a wildcard origin is not allowed.
    CORS_ORIGIN: z
      .string()
      .default('http://localhost:5173')
      .refine((v) => v.trim() !== '*', 'CORS_ORIGIN must be the frontend URL, not "*"'),
  })
  .parse(process.env)

export const config = env
