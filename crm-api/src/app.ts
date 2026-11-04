import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { randomUUID } from 'node:crypto'
import swaggerUi from 'swagger-ui-express'

import { config } from './config.js'
import { logger } from './lib/logger.js'
import { openapi } from './openapi.js'
import { errorHandler, notFound } from './middleware/error-handler.js'
import { authRouter } from './routes/auth.js'
import { companiesRouter } from './routes/companies.js'
import { contactsExportRouter } from './routes/contacts-export.js'
import { contactsImportRouter } from './routes/contacts-import.js'
import { contactsRouter } from './routes/contacts.js'
import { tagsRouter } from './routes/tags.js'
import { quickCreateRouter } from './routes/quick-create.js'
import { dashboardRouter } from './routes/dashboard.js'
import { usersRouter } from './routes/users.js'
import { healthRouter } from './routes/health.js'

export const app = express()

// One id per request, echoed back so a user's error report can be matched to the logs.
app.use(
  pinoHttp({
    logger,
    // One short line per request instead of dumping every header.
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    genReqId: (req, res) => {
      const incoming = req.headers['x-request-id']
      const id =
        typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID()
      res.setHeader('X-Request-Id', id)
      return id
    },
  }),
)

// Swagger UI needs inline scripts, so the docs get helmet without its CSP. Every other path gets
// the full defaults. Exactly one of the two runs per request: helmet sets its headers unconditionally.
const strictHeaders = helmet()
const docsHeaders = helmet({ contentSecurityPolicy: false })
app.use((req, res, next) =>
  (req.path.startsWith('/api/docs') ? docsHeaders : strictHeaders)(req, res, next),
)
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '100kb' }))

app.use('/api', healthRouter)
app.use('/api', authRouter)
app.use('/api', usersRouter)
app.use('/api', dashboardRouter)
app.use('/api', contactsExportRouter)
app.use('/api', contactsImportRouter)
app.use('/api', contactsRouter)
app.use('/api', companiesRouter)
app.use('/api', tagsRouter)
app.use('/api', quickCreateRouter)

app.get('/api/openapi.json', (_req, res) => {
  res.json(openapi)
})
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi))

app.use(notFound)
app.use(errorHandler)
