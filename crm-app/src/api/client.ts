import axios from 'axios'

import { useAuthStore } from '@/store/auth-store'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api',
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // Expired/invalid session on a protected call: clear it so route guards redirect to login.
    // (Login itself returns 401 for bad credentials; leave that for the form to show.)
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      useAuthStore.getState().logout()
    }
    return Promise.reject(error)
  },
)

/** Message from the API's `{ error: { message } }` shape, with a fallback. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong') {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Cannot reach the server. Please try again.'
    return error.response.data?.error?.message ?? fallback
  }
  return fallback
}

/** Per-field errors from a 400/409 response, e.g. `{ email: 'Already exists' }`. */
export function getFieldErrors(error: unknown): Record<string, string> {
  if (axios.isAxiosError(error)) return error.response?.data?.error?.details ?? {}
  return {}
}
