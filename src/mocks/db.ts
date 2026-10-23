import type { AuditAction, AuditEntryDto, SystemRole, UserStatus, VaultRole } from '@/api/types'
import { clearBlobs } from './blobStore'
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
  emailVerified: boolean
  systemRole: SystemRole
  createdAt: string
  lastActiveAt: string | null
  // what a real server keeps: salts + a hash of the verifier, never the password
  saltAuth: string
  saltWrap: string
  verifierHash: string
  // opaque blobs from the key ceremony
  publicKey: string
  sealedPrivateKey: string
  sealedRecoveryKey: string
  keyVersion: number
  fingerprint: string
  keysCreatedAt: string | null
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

// familyId = the refresh family it came from, i.e. which session ("device") it belongs to
export type MockAccessToken = {
  token: string
  userId: string
  familyId: string | null
  expiresAt: number
}

export type MockRefreshToken = {
  token: string
  userId: string
  familyId: string
  usedAt: string | null
  createdAt: string
  expiresAt: number
  userAgent: string
  remember: boolean
}

export type MockMfaToken = { token: string; userId: string; expiresAt: number }

export type MockFactor = {
  id: string
  userId: string
  type: 'totp' | 'webauthn'
  label: string
  secret: string | null
  credentialId: string | null
  confirmed: boolean
  createdAt: string
  lastUsedAt: string | null
}

export type MockRecoveryCode = { userId: string; hash: string; usedAt: string | null }

export type MockEmailCode = { email: string; hash: string; expiresAt: number; sentAt: number }

export type MockRecoveryToken = {
  token: string
  userId: string
  mode: 'kit' | 'reset'
  expiresAt: number
  usedAt: string | null
  challenge: string | null
}

export type MockChallenge = { key: string; challenge: string; expiresAt: number }

export type MockStepUp = { token: string; userId: string; action: string; expiresAt: number }

export type MockInvitation = {
  id: string
  token: string
  email: string
  vaultId: string
  role: VaultRole
  invitedBy: string
  status: 'pending' | 'accepted' | 'expired'
  createdAt: string
  expiresAt: string
}

// mails the server "sent". shown in the dev inbox panel, there is no SMTP here
export type MockMail = {
  id: string
  to: string
  subject: string
  body: string
  code: string | null
  link: string | null
  createdAt: string
}

export type MockAudit = Omit<AuditEntryDto, 'actorName'> & {
  action: AuditAction
  // set by the /__dev/audit-tamper switch only
  tamperedFrom?: AuditAction
}

// ---- files (Files, FileVersions, Chunks, WrappedKeys in the book's ERD) ----

export type MockFile = {
  id: string
  vaultId: string
  // sealed with the current version's data key
  encName: string
  nameIv: string
  mimeType: string
  ownerId: string
  state: 'uploading' | 'active' | 'trashed'
  deletedAt: string | null
  deletedBy: string | null
  createdAt: string
  updatedAt: string
}

export type MockVersion = {
  id: string
  fileId: string
  versionNo: number
  sizeBytes: number
  chunkCount: number
  digest: string
  encNote: string | null
  noteIv: string | null
  storagePfx: string
  committed: boolean
  createdAt: string
  createdBy: string
}

export type MockChunk = {
  versionId: string
  index: number
  iv: string
  tag: string
  digest: string
}

export type MockWrappedKey = {
  versionId: string
  userId: string
  keyVersion: number
  wrapped: string
}

export type MockFavorite = { userId: string; fileId: string }

// a file shared straight with someone outside its vault
export type MockShare = {
  fileId: string
  userId: string
  role: 'viewer' | 'editor'
  sharedBy: string
  sharedAt: string
  expiresAt: string | null
}

export type MockLink = {
  id: string
  token: string
  fileId: string
  versionId: string
  createdBy: string
  // data key sealed under the key in the URL fragment; dropped on revoke
  reWrapped: string | null
  passphraseSalt: string | null
  encName: string
  nameIv: string
  expiresAt: string
  // 0 = no limit
  maxDownloads: number
  downloads: number
  requireSignIn: boolean
  allowDownload: boolean
  revoked: boolean
  createdAt: string
}

// a version being re-encrypted under a fresh key (after a revoke)
export type MockRekey = {
  id: string
  versionId: string
  storagePfx: string
  chunkCount: number
  createdBy: string
}

export type MockAccess = {
  userId: string
  fileId: string
  action: 'upload' | 'download'
  at: string
}

export type NotificationCategory = 'share' | 'access' | 'security' | 'quota'

export type MockNotification = {
  id: string
  userId: string
  key: string
  category: NotificationCategory
  // may contain {file}: the browser swaps in the decrypted name, the server can't know it
  title: string
  body: string
  link: string | null
  fileId: string | null
  read: boolean
  createdAt: string
}

export type MockNotificationPref = { userId: string; key: string; enabled: boolean }

export type MockKeyHistory = {
  userId: string
  keyVersion: number
  fingerprint: string
  algorithm: string
  createdAt: string
  retiredAt: string | null
  // retired = replaced by a rotation (every key re-wrapped); revoked = reset, keys lost
  state: 'active' | 'retired' | 'revoked'
}

// organisation-wide settings an admin can change
export type MockSettings = {
  retentionDays: number
  quotaBytes: number
  linkMaxDays: number
  mfaRequired: boolean
}

export type MockDb = {
  version: number
  users: MockUser[]
  vaults: MockVault[]
  members: MockMember[]
  accessTokens: MockAccessToken[]
  refreshTokens: MockRefreshToken[]
  mfaTokens: MockMfaToken[]
  factors: MockFactor[]
  recoveryCodes: MockRecoveryCode[]
  emailCodes: MockEmailCode[]
  recoveryTokens: MockRecoveryToken[]
  challenges: MockChallenge[]
  stepUps: MockStepUp[]
  invitations: MockInvitation[]
  outbox: MockMail[]
  audit: MockAudit[]
  files: MockFile[]
  versions: MockVersion[]
  chunks: MockChunk[]
  wrappedKeys: MockWrappedKey[]
  favorites: MockFavorite[]
  access: MockAccess[]
  shares: MockShare[]
  links: MockLink[]
  rekeys: MockRekey[]
  notifications: MockNotification[]
  notificationPrefs: MockNotificationPref[]
  keyHistory: MockKeyHistory[]
  settings: MockSettings
}

// bump when the shape changes, old local data gets reseeded
const DB_VERSION = 6
const STORAGE_KEY = 'vaultshare.mock-db'

export let db = {} as MockDb

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

export async function initDb() {
  const existing = load()
  if (existing) {
    db = existing
  } else {
    // the encrypted file chunks live in IndexedDB, start those over too
    await clearBlobs()
    db = { version: DB_VERSION, ...(await seed()) }
  }
  save()
}

export function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

export async function resetMockDb() {
  localStorage.removeItem(STORAGE_KEY)
  await clearBlobs()
  document.cookie = 'vs_refresh=; Path=/; Max-Age=0'
  window.location.href = '/'
}
