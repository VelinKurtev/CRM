import { app } from './app.js'
import { config } from './config.js'
import { syncPermissions } from './lib/permissions.js'
import { prisma } from './lib/prisma.js'

// Keep roles/permissions in the database in line with the matrix in code.
await syncPermissions(prisma)

app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`)
})
