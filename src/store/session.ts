import { create } from 'zustand'
import type { MfaMethod, UserDto } from '@/api/types'

/*
  Everything sensitive lives here and only here, in memory.
  Nothing in this store is ever written to localStorage — a reload means
  the access token comes back from the refresh cookie and the private key
  needs the password again.
*/

// FR-06: lock after 15 minutes without activity, unless the person picked another value
export const IDLE_MINUTES = 15

export const idleMinutesOf = (user: UserDto | null) => user?.idleLockMinutes ?? IDLE_MINUTES

// between "password accepted" and "second factor accepted"
export type PendingMfa = {
  token: string
  methods: MfaMethod[]
  email: string
  remember: boolean
}

type SessionState = {
  user: UserDto | null
  accessToken: string | null
  // set while the user is between password and second factor
  mfa: PendingMfa | null
  // derived from the password; kept only until the private key is opened / sealed
  wrapKey: CryptoKey | null
  // the salt it was derived with, to notice if the server's salts changed meanwhile
  wrapSalt: string | null
  // unwrapped RSA private key, non-extractable. null = vault is locked
  privateKey: CryptoKey | null
  // epoch ms when the idle lock kicks in
  lockAt: number | null

  setSession: (accessToken: string, user: UserDto) => void
  setAccessToken: (token: string | null) => void
  setUser: (user: UserDto) => void
  setMfa: (mfa: PendingMfa | null) => void
  setWrapKey: (key: CryptoKey | null, saltWrap?: string | null) => void
  unlock: (privateKey: CryptoKey) => void
  touch: () => void
  lock: () => void
  clear: () => void
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  accessToken: null,
  mfa: null,
  wrapKey: null,
  wrapSalt: null,
  privateKey: null,
  lockAt: null,

  setSession: (accessToken, user) => set({ accessToken, user, mfa: null }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
  setMfa: (mfa) => set({ mfa }),
  setWrapKey: (wrapKey, saltWrap = null) => set({ wrapKey, wrapSalt: wrapKey ? saltWrap : null }),

  // once the private key is open the wrap key isn't needed any more
  unlock: (privateKey) =>
    set({
      privateKey,
      wrapKey: null,
      wrapSalt: null,
      lockAt: Date.now() + idleMinutesOf(get().user) * 60_000,
    }),

  touch: () => {
    if (get().privateKey) set({ lockAt: Date.now() + idleMinutesOf(get().user) * 60_000 })
  },

  // drop the key references so they can be garbage collected
  lock: () => set({ privateKey: null, wrapKey: null, wrapSalt: null, lockAt: null }),

  clear: () =>
    set({
      user: null,
      accessToken: null,
      mfa: null,
      wrapKey: null,
      wrapSalt: null,
      privateKey: null,
      lockAt: null,
    }),
}))

export const isUnlocked = () => useSession.getState().privateKey !== null
