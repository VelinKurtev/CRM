import { logger } from './logger.js'
import { prisma } from './prisma.js'

type AuditEntry = {
  action: string
  userId?: string | null
  entityType?: string
  entityId?: string | null
  changes?: Record<string, string | number | boolean | null>
  ip?: string
}

/**
 * Record a security-relevant event. Best effort: a failure to write the log is reported but must
 * never block the user's request (e.g. sign-in).
 */
export async function audit(entry: AuditEntry) {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType ?? 'User',
        entityId: entry.entityId ?? entry.userId ?? null,
        userId: entry.userId ?? null,
        changes: entry.changes,
        ipAddress: entry.ip,
      },
    })
  } catch (err) {
    logger.error({ err, action: entry.action }, 'Failed to write audit log')
  }
}
