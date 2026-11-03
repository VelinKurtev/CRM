import { api } from '@/api/client'
import type { AuthUser } from '@/types/auth'

export type ManagedUser = AuthUser & { isActive: boolean; createdAt: string }
export type UsersPage = { users: ManagedUser[]; total: number; page: number; pageSize: number }
export type RoleInfo = { name: string; permissions: string[] }

export const listUsers = (params: { q?: string; page?: number; pageSize?: number }) =>
  api.get<UsersPage>('/users', { params }).then((r) => r.data)

export const assignRole = (userId: string, role: string) =>
  api.patch<{ user: ManagedUser }>(`/users/${userId}/role`, { role }).then((r) => r.data.user)

export const listRoles = () => api.get<{ roles: RoleInfo[] }>('/roles').then((r) => r.data.roles)
