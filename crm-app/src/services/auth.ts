import { api } from '@/api/client'
import type { AuthUser } from '@/types/auth'

export type LoginResponse = { token: string; user: AuthUser }

export const login = (email: string, password: string) =>
  api.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data)
