import cors from 'cors'
import express from 'express'

import { config } from './config.js'
import { healthRouter } from './routes/health.js'

export const app = express()

app.use(cors({ origin: config.CORS_ORIGIN }))
app.use(express.json())

app.use('/api', healthRouter)
