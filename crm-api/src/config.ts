import 'dotenv/config'
import { z } from 'zod'

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().default(4000),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
    JWT_EXPIRES_IN: z.string().default('1h'),
    APP_URL: z.string().default('http://localhost:5173'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('CRM <no-reply@crm.local>'),
    RESET_TOKEN_TTL_MINUTES: z.coerce.number().default(60),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
  })
  .parse(process.env)

export const config = env
