import type { PrismaClient } from '../generated/prisma/client.js'

export const ROLES = ['ADMIN', 'MANAGER', 'SALES', 'SUPPORT'] as const
export type RoleName = (typeof ROLES)[number]

const CRM_ENTITIES = [
  'contacts',
  'companies',
  'leads',
  'deals',
  'tasks',
  'activities',
  'notes',
  'documents',
  'emails',
] as const

/** Every permission the system knows about, as `resource:action`. */
export const PERMISSIONS = [
  ...CRM_ENTITIES.flatMap((e) => [`${e}:read`, `${e}:write`, `${e}:delete`]),
  'contacts:delete_own', // delete contacts you own (contacts:delete covers anyone's)
  'contacts:export', // download contacts as a file
  'tags:manage', // rename, recolor and delete tags
  'reports:read',
  'users:read', // see the team list
  'users:manage', // assign roles, manage accounts
  'audit:read',
  'settings:manage',
] as const
export type Permission = (typeof PERMISSIONS)[number]

const all = (resources: readonly string[], actions: string[]) =>
  resources.flatMap((r) => actions.map((a) => `${r}:${a}`)) as Permission[]

/** Which permissions each role gets. This is the single source of truth. */
export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  ADMIN: [...PERMISSIONS],

  // Runs the team: full control of CRM data and reports, can see (not manage) users.
  MANAGER: [
    ...all(CRM_ENTITIES, ['read', 'write', 'delete']),
    'contacts:export',
    'tags:manage',
    'reports:read',
    'users:read',
  ],

  // Works the pipeline: create/edit CRM data, but can't delete other people's contacts, or any
  // companies, deals or leads. They can remove contacts they created themselves.
  SALES: [
    ...all(CRM_ENTITIES, ['read', 'write']),
    'contacts:delete_own',
    ...all(['tasks', 'activities', 'notes'], ['delete']),
  ],

  // Helps customers: read the customer record, log activity, notes, tasks and emails.
  SUPPORT: [
    ...all(['contacts', 'companies', 'deals', 'documents'], ['read']),
    ...all(['tasks', 'activities', 'notes', 'emails'], ['read', 'write']),
  ],
}

/** Make the database match the matrix above. Safe to run repeatedly. */
export async function syncPermissions(db: PrismaClient) {
  for (const key of PERMISSIONS) {
    await db.permission.upsert({ where: { key }, update: {}, create: { key } })
  }
  const permissions = await db.permission.findMany()
  const idByKey = new Map(permissions.map((p) => [p.key, p.id]))

  for (const name of ROLES) {
    const role = await db.role.upsert({ where: { name }, update: {}, create: { name } })
    const wanted = ROLE_PERMISSIONS[name].map((k) => idByKey.get(k)!)
    await db.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: wanted } },
    })
    await db.rolePermission.createMany({
      data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    })
  }
}
