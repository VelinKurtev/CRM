import 'dotenv/config'
import { z } from 'zod'

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().default(4000),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
  })
  .parse(process.env)

export const config = env
