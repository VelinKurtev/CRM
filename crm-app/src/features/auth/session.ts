import { refreshAccessToken } from '@/api/client'
import { logoutRequest } from '@/services/auth'
import { useAuthStore } from '@/store/auth-store'

let started: Promise<void> | null = null

/** On page load, try to restore the session from the refresh cookie. Runs once. */
export function initAuth() {
  started ??= refreshAccessToken()
    .then(() => undefined)
    .catch(() => useAuthStore.getState().clearSession())
    .finally(() => useAuthStore.getState().setInitialized())
  return started
}

/** Test helper: allow initAuth to run again. */
export function resetAuthInit() {
  started = null
}

export async function signOut() {
  try {
    await logoutRequest()
  } catch {
    // Even if the server can't be reached, drop the local session.
  }
  useAuthStore.getState().clearSession()
}
