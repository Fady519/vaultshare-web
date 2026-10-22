import type { SystemRole, UserStatus, VaultRole } from '@/api/types'
import { seed } from './seed'

/*
  The fake server's "database". Rows look like the SQL tables in the book
  (figure 3-7) plus the extra ones listed in the roadmap. It's kept in
  localStorage so a page reload doesn't wipe what you did.
*/

export type MockUser = {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  locale: string
  status: UserStatus
  systemRole: SystemRole
  createdAt: string
  // auth (stored as the server would: opaque base64)
  saltAuth: string
  saltWrap: string
  verifier: string
  // keys
  publicKey: string
  sealedPrivateKey: string
  sealedRecoveryKey: string
  keyVersion: number
  fingerprint: string
  keysCreatedAt: string | null
  mfaEnabled: boolean
  idleLockMinutes: number
}

export type MockVault = {
  id: string
  name: string
  description: string
  ownerId: string
  createdAt: string
}

export type MockMember = {
  vaultId: string
  userId: string
  role: VaultRole
  status: 'active' | 'pending'
  joinedAt: string
}

export type MockToken = {
  token: string
  userId: string
  expiresAt: number
}

export type MockDb = {
  version: number
  users: MockUser[]
  vaults: MockVault[]
  members: MockMember[]
  accessTokens: MockToken[]
}

// bump when the shape changes, old local data gets reseeded
const DB_VERSION = 1
const STORAGE_KEY = 'vaultshare.mock-db'

function load(): MockDb | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MockDb
    return parsed.version === DB_VERSION ? parsed : null
  } catch {
    return null
  }
}

export const db: MockDb = load() ?? { version: DB_VERSION, ...seed() }

export function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

export function resetMockDb() {
  localStorage.removeItem(STORAGE_KEY)
  window.location.reload()
}

save()
