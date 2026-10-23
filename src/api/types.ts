/*
  The API contract. Same shapes as section 10 of the roadmap PDF.
  Backend: if a response doesn't match these types, the backend is the one that changes.

  - all ids are lowercase GUID strings
  - all dates are ISO 8601 UTC strings
  - every binary value (salts, sealed keys, iv, tag, digest) is standard base64
  - audit hashes are lowercase hex
*/

export type Guid = string
export type IsoDate = string
export type Base64 = string

export type VaultRole = 'owner' | 'manager' | 'editor' | 'viewer'
export type SystemRole = 'user' | 'admin' | 'auditor'
export type UserStatus = 'pendingKeys' | 'pendingMfa' | 'active' | 'disabled'

export type Paged<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type ProblemDetails = {
  type?: string
  title: string
  status: number
  detail?: string
  code: ErrorCode
  errors?: Record<string, string[]>
  action?: StepUpAction
}

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'MFA_INVALID'
  | 'TOKEN_EXPIRED'
  | 'REFRESH_REUSED'
  | 'UNAUTHENTICATED'
  | 'EMAIL_NOT_VERIFIED'
  | 'FORBIDDEN_ROLE'
  | 'STEP_UP_REQUIRED'
  | 'NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'ALREADY_MEMBER'
  | 'LAST_FACTOR'
  | 'CURRENT_SESSION'
  | 'LINK_GONE'
  | 'QUOTA_EXCEEDED'
  | 'UPLOAD_INCOMPLETE'
  | 'MISSING_WRAPPED_KEYS'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'

export type StepUpAction =
  | 'share.grant'
  | 'share.change'
  | 'share.revoke'
  | 'member.role'
  | 'member.revoke'
  | 'member.invite'
  | 'link.create'
  | 'link.revoke'
  | 'vault.delete'
  | 'vault.transfer'
  | 'account.delete'
  | 'keys.rotate'
  | 'keys.recovery'
  | 'mfa.remove'
  | 'mfa.regenerate'
  | 'audit.export'

export type Person = { id: Guid; displayName: string }

// ---------- users & auth ----------

export type UserDto = {
  id: Guid
  email: string
  displayName: string
  avatarUrl: string | null
  locale: string
  status: UserStatus
  systemRole: SystemRole
  keyVersion: number
  mfaEnabled: boolean
  // the idle lock, per person (5 | 15 | 30 | 60)
  idleLockMinutes: number
  createdAt: IsoDate
}

export type KdfParams = { alg: 'argon2id'; m: number; t: number; p: number }

export type PreloginResponse = { saltAuth: Base64; saltWrap: Base64; kdf: KdfParams }

export type RegisterRequest = {
  email: string
  displayName: string
  saltAuth: Base64
  saltWrap: Base64
  verifier: Base64
}

// the server emails a 6-digit code (valid 10 min) after /auth/register
export type VerifyEmailRequest = { email: string; code: string }

export type SessionResponse = { accessToken: string; expiresIn: number; user: UserDto }

export type LoginRequest = { email: string; verifier: Base64; rememberDevice: boolean }

export type LoginResponse =
  | { mfaRequired: true; mfaToken: string; methods: MfaMethod[] }
  | ({ mfaRequired: false } & SessionResponse)

export type MfaMethod = 'totp' | 'webauthn' | 'recovery'

export type LoginMfaRequest = {
  mfaToken: string
  method: 'totp' | 'recovery'
  code: string
  rememberDevice?: boolean
}

export type RefreshResponse = { accessToken: string; expiresIn: number }

export type StepUpRequest = {
  action: StepUpAction
  method: 'totp' | 'webauthn'
  code?: string
  assertion?: unknown
}

export type StepUpResponse = { stepUpToken: string; expiresAt: IsoDate }

export type RecoveryMode = 'kit' | 'reset'

export type RecoveryVerifyResponse = {
  mode: RecoveryMode
  email: string
  kdf: KdfParams
  sealedRecoveryKey?: Base64
  challenge?: Base64
}

export type RecoveryCompleteRequest = {
  token: string
  saltAuth: Base64
  saltWrap: Base64
  verifier: Base64
  sealedPrivateKey: Base64
  challengeAnswer?: Base64
  publicKey?: Base64
  sealedRecoveryKey?: Base64
  keyVersion?: number
}

// ---------- keys & mfa ----------

export type KeySetupRequest = {
  publicKey: Base64
  sealedPrivateKey: Base64
  sealedRecoveryKey: Base64
  keyVersion: number
}

export type MyKeysDto = {
  publicKey: Base64
  sealedPrivateKey: Base64
  keyVersion: number
  fingerprint: string
  createdAt: IsoDate
}

export type TotpSetupResponse = { secret: string; otpauthUri: string }

export type MfaFactorDto = {
  id: Guid
  type: 'totp' | 'webauthn'
  label: string
  createdAt: IsoDate
  lastUsedAt: IsoDate | null
}

export type UserLookupDto = {
  userId: Guid
  email: string
  displayName: string
  publicKey: Base64
  keyVersion: number
  fingerprint: string
}

// ---------- vaults ----------

export type VaultDto = {
  id: Guid
  name: string
  description: string
  ownerId: Guid
  role: VaultRole
  // pending = invited, but nobody has wrapped the vault's keys for me yet
  myStatus: 'active' | 'pending'
  fileCount: number
  memberCount: number
  sizeBytes: number
  createdAt: IsoDate
}

export type CreateVaultRequest = {
  name: string
  description: string
  members: { email: string; role: VaultRole }[]
}

export type MemberDto = {
  userId: Guid
  email: string
  displayName: string
  role: VaultRole
  status: 'active' | 'pending'
  joinedAt: IsoDate
  publicKey: Base64
  keyVersion: number
  fingerprint: string
}

export type InvitationDto = {
  id: Guid
  email: string
  role: VaultRole
  vaultId: Guid
  vaultName: string
  status: 'pending' | 'accepted' | 'expired'
  invitedBy: Person
  createdAt: IsoDate
  expiresAt: IsoDate
}

export type InvitationPreviewDto = {
  email: string
  role: VaultRole
  vaultName: string
  inviterName: string
  inviterEmail: string
  expiresAt: IsoDate
  fileCount: number
  memberCount: number
}

export type PendingGrantDto = {
  invitationId: Guid
  vaultId: Guid
  vaultName: string
  role: VaultRole
  recipient: {
    userId: Guid
    email: string
    displayName: string
    publicKey: Base64
    keyVersion: number
    fingerprint: string
  }
  // every version in the vault, each with the caller's own wrapped key to re-wrap from
  versions: { fileId: Guid; versionId: Guid; wrappedKey: WrappedKeyDto }[]
}

export type InviteRequest = { email: string; role: VaultRole; message?: string }

export type CompleteGrantRequest = { wrappedKeys: NewVersionKey[] }

// one wrapped key for one version and one person (grants, shares, moves)
export type NewVersionKey = { versionId: Guid; userId: Guid; keyVersion: number; wrapped: Base64 }

// ---------- files ----------

export type WrappedKeyDto = {
  versionId: Guid
  userId: Guid
  keyVersion: number
  wrapped: Base64
  algorithm: 'RSA-OAEP-4096-SHA256'
}

export type VersionDto = {
  id: Guid
  versionNo: number
  sizeBytes: number
  chunkCount: number
  digest: Base64
  // optional note ("Redlined clause 7.2"), sealed with this version's data key
  encNote: Base64 | null
  noteIv: Base64 | null
  createdAt: IsoDate
  createdBy: Person
  // only the caller's own key, null if they hold none
  wrappedKey: WrappedKeyDto | null
}

export type FileDto = {
  id: Guid
  vaultId: Guid
  vaultName: string
  encName: Base64
  nameIv: Base64
  mimeType: string
  sizeBytes: number
  ownerId: Guid
  ownerName: string
  state: 'active' | 'trashed'
  isFavorite: boolean
  deletedAt: IsoDate | null
  deletedBy: Person | null
  // deletedAt + the retention period; the server purges it then
  purgeAt: IsoDate | null
  updatedAt: IsoDate
  updatedBy: Person
  currentVersion: VersionDto
  people: { userId: Guid; displayName: string }[]
}

export type FileAccessEntry = {
  userId: Guid
  displayName: string
  email: string
  role: VaultRole
  source: 'vault' | 'share'
  hasKey: boolean
}

export type FileDetailDto = {
  file: FileDto
  access: FileAccessEntry[]
  wrappedKeyCount: number
  versionCount: number
  recentActivity: AuditEntryDto[]
  // the caller's own role, and whether it comes from the vault or a direct share
  myRole: VaultRole
  via: 'vault' | 'share'
}

export type UploadInitRequest = {
  fileId: Guid | null
  mimeType: string
  sizeBytes: number
  chunkCount: number
}

export type UploadInitResponse = {
  fileId: Guid
  versionId: Guid
  versionNo: number
  uploadUrls: { index: number; url: string }[]
  expiresAt: IsoDate
}

export type ChunkMeta = { index: number; iv: Base64; tag: Base64; digest: Base64 }

export type NewWrappedKey = { userId: Guid; keyVersion: number; wrapped: Base64 }

export type CommitRequest = {
  encName: Base64
  nameIv: Base64
  encNote?: Base64
  noteIv?: Base64
  digest: Base64
  chunks: ChunkMeta[]
  wrappedKeys: NewWrappedKey[]
}

export type DownloadResponse = {
  versionId: Guid
  mimeType: string
  sizeBytes: number
  chunkCount: number
  wrappedKey: WrappedKeyDto
  chunks: (ChunkMeta & { url: string })[]
}

export type BulkAction = 'trash' | 'restore' | 'purge' | 'favorite' | 'unfavorite'

export type BulkResponse = { done: Guid[]; failed: { id: Guid; code: ErrorCode }[] }

export type RecentEntry = { file: FileDto; accessedAt: IsoDate; action: 'upload' | 'download' }

export type AffectedVersions = { affectedVersions: { fileId: Guid; versionId: Guid }[] }

// ---------- sharing & links ----------

export type ShareRole = 'viewer' | 'editor'

export type ShareDto = {
  userId: Guid
  role: ShareRole
  sharedAt: IsoDate
  expiresAt: IsoDate | null
}

// GET /files/{id}/shares: everyone the file was shared with directly, with what's needed to wrap for them
export type FileShareDto = ShareDto & {
  email: string
  displayName: string
  sharedBy: Person
  publicKey: Base64
  keyVersion: number
  fingerprint: string
}

export type CreateShareRequest = {
  userId: Guid
  role: ShareRole
  expiresAt: IsoDate | null
  // one per committed version of the file
  wrappedKeys: { versionId: Guid; keyVersion: number; wrapped: Base64 }[]
}

export type IncomingShare = {
  file: FileDto
  sharedBy: Person & { email: string }
  role: ShareRole
  sharedAt: IsoDate
  expiresAt: IsoDate | null
}

export type OutgoingShare = {
  file: FileDto
  recipient: Person & { email: string }
  role: ShareRole
  sharedAt: IsoDate
  expiresAt: IsoDate | null
  lastUsedAt: IsoDate | null
}

export type CreateLinkRequest = {
  versionId: Guid
  // the data key sealed under the key in the link's #fragment (+ passphrase)
  reWrapped: Base64
  passphraseSalt: Base64 | null
  // the name sealed with this version's key, so the link keeps working after new versions
  encName: Base64
  nameIv: Base64
  expiresAt: IsoDate
  // 0 = no limit
  maxDownloads: number
  requireSignIn: boolean
  allowDownload: boolean
}

export type LinkDto = {
  id: Guid
  token: string
  fileId: Guid
  versionId: Guid
  expiresAt: IsoDate
  maxDownloads: number
  downloads: number
  hasPassphrase: boolean
  requireSignIn: boolean
  allowDownload: boolean
  revoked: boolean
  createdAt: IsoDate
}

export type PublicLinkDto = {
  fileId: Guid
  versionId: Guid
  mimeType: string
  sizeBytes: number
  chunkCount: number
  encName: Base64
  nameIv: Base64
  reWrapped: Base64
  passphraseSalt: Base64 | null
  expiresAt: IsoDate
  // null = no limit
  downloadsLeft: number | null
  allowDownload: boolean
}

export type PublicLinkDownload = { chunks: (ChunkMeta & { url: string })[] }

// re-keying one version after someone lost access
export type RekeyInitResponse = {
  rekeyId: Guid
  uploadUrls: { index: number; url: string }[]
  // who must get the new key: the vault's members + direct shares, as of now
  recipients: { userId: Guid; publicKey: Base64; keyVersion: number }[]
}

export type RekeyCommitRequest = {
  chunks: ChunkMeta[]
  digest: Base64
  wrappedKeys: NewWrappedKey[]
  // sealed again under the new key: the note always, the name if this is the current version
  encNote?: Base64
  noteIv?: Base64
  encName?: Base64
  nameIv?: Base64
}

// ---------- settings, team, admin ----------

export type SessionDto = {
  id: Guid
  device: string
  browser: string
  os: string
  ipMasked: string
  location: string
  createdAt: IsoDate
  // when this browser was first seen for the account
  firstSeenAt: IsoDate
  lastActiveAt: IsoDate
  refreshExpiresAt: IsoDate
  // "remember this device" was ticked
  trusted: boolean
  current: boolean
}

export type ChangePasswordRequest = {
  // proves the current password without sending it
  currentVerifier: Base64
  saltAuth: Base64
  saltWrap: Base64
  verifier: Base64
  // the same private key, sealed under the new password
  sealedPrivateKey: Base64
  signOutOthers: boolean
}

export type KeyHistoryDto = {
  keyVersion: number
  fingerprint: string
  algorithm: string
  createdAt: IsoDate
  retiredAt: IsoDate | null
  // how many data keys are wrapped to this key right now
  wrappedCount: number
  state: 'active' | 'retired' | 'revoked'
}

export type RotateKeysRequest = {
  publicKey: Base64
  sealedPrivateKey: Base64
  sealedRecoveryKey: Base64
  keyVersion: number
  // every data key I hold, wrapped again to the new public key
  rewrapped: { versionId: Guid; wrapped: Base64 }[]
}

export type SecurityOverviewDto = {
  factors: MfaFactorDto[]
  activeSessions: number
  idleLockMinutes: number
  recoveryCodesLeft: number
  keyVersion: number
  recentEvents: AuditEntryDto[]
}

export type NotificationDto = {
  id: Guid
  key: string
  category: 'share' | 'access' | 'security' | 'quota'
  // may contain "{file}": the browser puts in the name it decrypts, the server never has it
  title: string
  body: string
  link: string | null
  fileId: Guid | null
  read: boolean
  createdAt: IsoDate
}

export type NotificationSettingDto = {
  key: string
  group: 'security' | 'sharing' | 'vault'
  label: string
  channels: string
  enabled: boolean
  // security alerts: always on
  locked: boolean
}

export type TeamMemberDto = {
  userId: Guid
  displayName: string
  email: string
  systemRole: SystemRole
  status: UserStatus
  lastActiveAt: IsoDate | null
  vaults: { vaultId: Guid; name: string; role: VaultRole; status: 'active' | 'pending' }[]
  mfa: ('totp' | 'webauthn')[]
  fingerprint: string | null
}

export type StorageUsageDto = {
  usedBytes: number
  quotaBytes: number
  overheadBytes: number
  // ciphertext still in the trash, counted in usedBytes
  trashBytes: number
  retentionDays: number
  byVault: {
    vaultId: Guid
    name: string
    sizeBytes: number
    fileCount: number
    versionCount: number
    memberCount: number
  }[]
}

export type HealthState = 'ok' | 'degraded' | 'down'

export type AdminOverviewDto = {
  accounts: { total: number; active: number; pendingKeys: number; disabled: number }
  storage: { usedBytes: number; quotaBytes: number }
  activity: { date: string; uploads: number; downloads: number; shares: number }[]
  health: { api: HealthState; database: HealthState; storage: HealthState }
  policy: {
    idleLockMinutes: number
    trashRetentionDays: number
    linkMaxDays: number
    mfaRequired: boolean
  }
  security: {
    mfaEnrolled: number
    pendingKeyExchanges: { displayName: string; vaultName: string; since: IsoDate }[]
    failedSignIns7d: number
    sharesExpiring14d: number
  }
}

export type AdminUserDto = {
  id: Guid
  email: string
  displayName: string
  status: UserStatus
  systemRole: SystemRole
  storageBytes: number
  createdAt: IsoDate
  lastActiveAt: IsoDate | null
  fingerprint: string | null
  mfa: ('totp' | 'webauthn')[]
}

// ---------- audit ----------

export type AuditAction =
  | 'auth.register'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.step_up'
  | 'mfa.add'
  | 'mfa.remove'
  | 'keys.setup'
  | 'keys.rotate'
  | 'vault.create'
  | 'vault.rename'
  | 'vault.delete'
  | 'vault.transfer'
  | 'member.add'
  | 'member.role'
  | 'member.revoke'
  | 'invite.create'
  | 'invite.accept'
  | 'file.upload'
  | 'file.version'
  | 'file.download'
  | 'file.rename'
  | 'file.move'
  | 'file.trash'
  | 'file.restore'
  | 'file.purge'
  | 'share.grant'
  | 'share.change'
  | 'share.revoke'
  | 'link.create'
  | 'link.revoke'
  | 'link.download'
  | 'rekey.version'
  | 'audit.export'
  | 'session.revoke'
  | 'account.delete'
  | 'auth.password'
  | 'keys.recovery'

export type AuditEntryDto = {
  seq: number
  timestamp: IsoDate
  actorId: Guid | null
  actorName: string | null
  action: AuditAction
  resourceType: 'user' | 'vault' | 'file' | 'version' | 'link' | 'session'
  resourceId: Guid
  prevHash: string
  hash: string
}

export type AuditQuery = {
  vaultId?: Guid
  actorId?: Guid
  action?: AuditAction
  from?: IsoDate
  to?: IsoDate
  page?: number
  pageSize?: number
}

// the signature is null until the backend signs daily anchors (RSA-PSS)
export type AuditExportDto = {
  entries: AuditEntryDto[]
  anchors: AuditAnchorDto[]
  signature: Base64 | null
}

export type AuditAnchorDto = {
  date: string
  headSeq: number
  headHash: string
  signature: Base64
  publicKey: Base64
}
