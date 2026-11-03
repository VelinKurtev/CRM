import type { RequestHandler } from 'express'

import { HttpError } from '../lib/http-error.js'
import type { Permission } from '../lib/permissions.js'
import { permissionsOf, userInclude } from '../lib/public-user.js'
import { prisma } from '../lib/prisma.js'
import { readAuth } from './authenticate.js'

/**
 * Require a valid login AND every listed permission.
 * Permissions are read from the database on each request, not from the token, so a role
 * change by an admin takes effect immediately.
 */
export const requirePermission =
  (...required: Permission[]): RequestHandler =>
  async (req, _res, next) => {
    const { userId } = readAuth(req)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: userInclude,
    })
    if (!user || !user.isActive) throw new HttpError(401, 'Invalid or expired token')

    const have = new Set(permissionsOf(user))
    if (!required.every((p) => have.has(p))) throw new HttpError(403, 'You do not have permission')

    req.auth = { userId: user.id, role: user.role.name }
    next()
  }
