import type { Role } from '.'

export type AuthUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  role: Uppercase<Role>
}
