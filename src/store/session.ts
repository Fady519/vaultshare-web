import { create } from 'zustand'
import type { UserDto } from '@/api/types'

/*
  Everything sensitive lives here and only here, in memory.
  Nothing in this store is ever written to localStorage — a reload means
  the access token comes back from the refresh cookie and the private key
  needs the password again.
*/

// FR-06: lock after 15 minutes without activity
export const IDLE_MINUTES = 15

type SessionState = {
  user: UserDto | null
  accessToken: string | null
  // set while the user is between password and second factor
  mfaToken: string | null
  // derived from the password; kept only until the private key is opened / sealed
  wrapKey: CryptoKey | null
  // unwrapped RSA private key, non-extractable. null = vault is locked
  privateKey: CryptoKey | null
  // epoch ms when the idle lock kicks in
  lockAt: number | null

  setSession: (accessToken: string, user: UserDto) => void
  setAccessToken: (token: string | null) => void
  setUser: (user: UserDto) => void
  setMfaToken: (token: string | null) => void
  setWrapKey: (key: CryptoKey | null) => void
  unlock: (privateKey: CryptoKey) => void
  touch: () => void
  lock: () => void
  clear: () => void
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  accessToken: null,
  mfaToken: null,
  wrapKey: null,
  privateKey: null,
  lockAt: null,

  setSession: (accessToken, user) => set({ accessToken, user, mfaToken: null }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
  setMfaToken: (mfaToken) => set({ mfaToken }),
  setWrapKey: (wrapKey) => set({ wrapKey }),

  // once the private key is open the wrap key isn't needed any more
  unlock: (privateKey) =>
    set({ privateKey, wrapKey: null, lockAt: Date.now() + IDLE_MINUTES * 60_000 }),

  touch: () => {
    if (get().privateKey) set({ lockAt: Date.now() + IDLE_MINUTES * 60_000 })
  },

  // drop the key references so they can be garbage collected
  lock: () => set({ privateKey: null, wrapKey: null, lockAt: null }),

  clear: () =>
    set({
      user: null,
      accessToken: null,
      mfaToken: null,
      wrapKey: null,
      privateKey: null,
      lockAt: null,
    }),
}))

export const isUnlocked = () => useSession.getState().privateKey !== null
