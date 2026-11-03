/** The user fields that are safe to send to clients (never the password hash). */
export const publicUser = (u: {
  id: string
  email: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  role: { name: string }
}) => ({
  id: u.id,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  avatarUrl: u.avatarUrl,
  role: u.role.name,
})
