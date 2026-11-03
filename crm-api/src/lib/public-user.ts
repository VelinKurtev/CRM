/** Load a user together with their role and that role's permissions. */
export const userInclude = {
  role: { include: { permissions: { include: { permission: true } } } },
} as const

type UserWithRole = {
  id: string
  email: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  role: { name: string; permissions: { permission: { key: string } }[] }
}

export const permissionsOf = (u: UserWithRole) =>
  u.role.permissions.map((rp) => rp.permission.key).sort()

/** The user fields that are safe to send to clients (never the password hash). */
export const publicUser = (u: UserWithRole) => ({
  id: u.id,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  avatarUrl: u.avatarUrl,
  role: u.role.name,
  permissions: permissionsOf(u),
})
