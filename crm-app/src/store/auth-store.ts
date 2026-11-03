import { create } from 'zustand'

import type { AuthUser } from '@/types/auth'

type AuthState = {
  /** Short-lived access token. Kept in memory only, never in localStorage. */
  token: string | null
  user: AuthUser | null
  /** False until the first silent refresh on page load has finished. */
  initialized: boolean
  setSession: (token: string, user: AuthUser) => void
  clearSession: () => void
  setInitialized: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  user: null,
  initialized: false,
  setSession: (token, user) => set({ token, user }),
  clearSession: () => set({ token: null, user: null }),
  setInitialized: () => set({ initialized: true }),
}))
