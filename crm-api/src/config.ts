import 'dotenv/config'
import { z } from 'zod'

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().default(4000),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
    JWT_EXPIRES_IN: z.string().default('1h'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
  })
  .parse(process.env)

export const config = env
