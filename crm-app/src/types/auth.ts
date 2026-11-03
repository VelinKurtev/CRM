import type { Role } from '.'

export type AuthUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  /** e.g. `contacts:write`. Mirrors the API; the API is what actually enforces access. */
  permissions: string[]
  role: Uppercase<Role>
}
