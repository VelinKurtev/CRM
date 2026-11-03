import axios, { type InternalAxiosRequestConfig } from 'axios'

import { useAuthStore } from '@/store/auth-store'
import type { AuthUser } from '@/types/auth'

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

export const api = axios.create({ baseURL, withCredentials: true })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

type Session = { token: string; user: AuthUser }
let refreshing: Promise<Session> | null = null

/**
 * Exchange the httpOnly refresh cookie for a new access token.
 * Concurrent callers share one request: refresh tokens rotate, so a second call would fail.
 * Uses a bare axios call so it bypasses the interceptors below.
 */
export function refreshAccessToken(): Promise<Session> {
  refreshing ??= axios
    .post<Session>(`${baseURL}/auth/refresh`, undefined, { withCredentials: true })
    .then((r) => {
      useAuthStore.getState().setSession(r.data.token, r.data.user)
      return r.data
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

// Auth endpoints answer 401 for bad credentials/sessions; those are not "expired token" cases.
const isAuthUrl = (url?: string) => /\/auth\/(login|register|refresh|logout)/.test(url ?? '')

type Retryable = InternalAxiosRequestConfig & { _retried?: boolean }

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as Retryable | undefined
    if (
      error.response?.status !== 401 ||
      !original ||
      original._retried ||
      isAuthUrl(original.url)
    ) {
      return Promise.reject(error)
    }

    original._retried = true
    try {
      const { token } = await refreshAccessToken()
      original.headers.Authorization = `Bearer ${token}`
      return api(original)
    } catch {
      // Session is gone: clearing it makes the route guards send the user to /login.
      useAuthStore.getState().clearSession()
      return Promise.reject(error)
    }
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
