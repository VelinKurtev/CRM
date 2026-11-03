import { api } from '@/api/client'
import type { AuthUser } from '@/types/auth'

export type LoginResponse = { token: string; user: AuthUser }

export const login = (email: string, password: string) =>
  api.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data)

export type RegisterInput = {
  firstName: string
  lastName: string
  email: string
  password: string
}

export const register = (input: RegisterInput) =>
  api.post<LoginResponse>('/auth/register', input).then((r) => r.data)
