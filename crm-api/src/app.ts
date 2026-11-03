import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import swaggerUi from 'swagger-ui-express'

import { config } from './config.js'
import { openapi } from './openapi.js'
import { errorHandler, notFound } from './middleware/error-handler.js'
import { authRouter } from './routes/auth.js'
import { quickCreateRouter } from './routes/quick-create.js'
import { dashboardRouter } from './routes/dashboard.js'
import { usersRouter } from './routes/users.js'
import { healthRouter } from './routes/health.js'

export const app = express()

app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }))
app.use(cookieParser())
app.use(express.json())

app.use('/api', healthRouter)
app.use('/api', authRouter)
app.use('/api', usersRouter)
app.use('/api', dashboardRouter)
app.use('/api', quickCreateRouter)

app.get('/api/openapi.json', (_req, res) => {
  res.json(openapi)
})
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi))

app.use(notFound)
app.use(errorHandler)
