import { create } from 'zustand'
import type { UserDto } from '@/api/types'

/*
  Everything sensitive lives here and only here, in memory.
  Nothing in this store is ever written to localStorage — a reload means
  the access token comes back from the refresh cookie and the private key
  needs the password again.
*/

type SessionState = {
  user: UserDto | null
  accessToken: string | null
  // set while the user is between password and second factor
  mfaToken: string | null
  // unwrapped RSA private key, non-extractable. null = vault is locked
  privateKey: CryptoKey | null
  // epoch ms when the idle lock kicks in
  lockAt: number | null

  setSession: (accessToken: string, user: UserDto) => void
  setAccessToken: (token: string | null) => void
  setUser: (user: UserDto) => void
  setMfaToken: (token: string | null) => void
  unlock: (privateKey: CryptoKey, idleMinutes: number) => void
  touch: (idleMinutes: number) => void
  lock: () => void
  clear: () => void
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  accessToken: null,
  mfaToken: null,
  privateKey: null,
  lockAt: null,

  setSession: (accessToken, user) => set({ accessToken, user, mfaToken: null }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
  setMfaToken: (mfaToken) => set({ mfaToken }),

  unlock: (privateKey, idleMinutes) =>
    set({ privateKey, lockAt: Date.now() + idleMinutes * 60_000 }),

  touch: (idleMinutes) => {
    if (get().privateKey) set({ lockAt: Date.now() + idleMinutes * 60_000 })
  },

  // drop the key reference so it can be garbage collected
  lock: () => set({ privateKey: null, lockAt: null }),

  clear: () =>
    set({ user: null, accessToken: null, mfaToken: null, privateKey: null, lockAt: null }),
}))

export const isUnlocked = () => useSession.getState().privateKey !== null
