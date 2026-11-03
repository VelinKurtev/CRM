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

export const forgotPassword = (email: string) =>
  api.post<{ message: string }>('/auth/forgot-password', { email }).then((r) => r.data)

export const resetPassword = (token: string, password: string) =>
  api.post<{ message: string }>('/auth/reset-password', { token, password }).then((r) => r.data)

export const refreshSession = () => api.post<LoginResponse>('/auth/refresh').then((r) => r.data)

export const logoutRequest = () => api.post('/auth/logout').then(() => undefined)
