import cors from 'cors'
import express from 'express'
import swaggerUi from 'swagger-ui-express'

import { config } from './config.js'
import { openapi } from './openapi.js'
import { healthRouter } from './routes/health.js'

export const app = express()

app.use(cors({ origin: config.CORS_ORIGIN }))
app.use(express.json())

app.use('/api', healthRouter)

app.get('/api/openapi.json', (_req, res) => {
  res.json(openapi)
})
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi))
