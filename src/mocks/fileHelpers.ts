import type { FileDto, VaultRole, VersionDto, WrappedKeyDto } from '@/api/types'
import { db, type MockFile, type MockShare, type MockVersion } from './db'

// days a trashed file waits before it's purged (an admin setting, see /storage)
export const retentionDays = () => db.settings?.retentionDays ?? 30

export const roleOf = (vaultId: string, userId: string) =>
  db.members.find((m) => m.vaultId === vaultId && m.userId === userId)?.role

export const canWrite = (role?: VaultRole) =>
  role === 'owner' || role === 'manager' || role === 'editor'

export const canManage = (role?: VaultRole) => role === 'owner' || role === 'manager'

// a direct share that hasn't run out
export function shareOf(fileId: string, userId: string): MockShare | undefined {
  const s = db.shares.find((x) => x.fileId === fileId && x.userId === userId)
  return s && (!s.expiresAt || s.expiresAt > new Date().toISOString()) ? s : undefined
}

// what someone may do with a file: their vault role, or else what was shared with them
export function accessOf(file: MockFile, userId: string): VaultRole | undefined {
  return roleOf(file.vaultId, userId) ?? shareOf(file.id, userId)?.role
}

// everyone who must get a wrapped key for a new version (or a re-keyed one)
export function holdersOf(fileId: string, vaultId: string) {
  const ids = new Set(
    db.members.filter((m) => m.vaultId === vaultId && m.status === 'active').map((m) => m.userId),
  )
  for (const s of db.shares) if (s.fileId === fileId && shareOf(fileId, s.userId)) ids.add(s.userId)
  return db.users.filter((u) => ids.has(u.id) && u.publicKey)
}

export const purgeAtOf = (deletedAt: string) =>
  new Date(new Date(deletedAt).getTime() + retentionDays() * 86_400_000).toISOString()

export const userName = (id: string) => db.users.find((u) => u.id === id)?.displayName ?? 'Unknown'

export function committedVersions(fileId: string) {
  return db.versions
    .filter((v) => v.fileId === fileId && v.committed)
    .sort((a, b) => b.versionNo - a.versionNo)
}

export const currentVersion = (fileId: string): MockVersion | undefined =>
  committedVersions(fileId)[0]

export function wrappedKeyFor(versionId: string, userId: string): WrappedKeyDto | null {
  const k = db.wrappedKeys.find((w) => w.versionId === versionId && w.userId === userId)
  return k
    ? {
        versionId,
        userId,
        keyVersion: k.keyVersion,
        wrapped: k.wrapped,
        algorithm: 'RSA-OAEP-4096-SHA256',
      }
    : null
}

export function toVersionDto(v: MockVersion, userId: string): VersionDto {
  return {
    id: v.id,
    versionNo: v.versionNo,
    sizeBytes: v.sizeBytes,
    chunkCount: v.chunkCount,
    digest: v.digest,
    encNote: v.encNote,
    noteIv: v.noteIv,
    createdAt: v.createdAt,
    createdBy: { id: v.createdBy, displayName: userName(v.createdBy) },
    wrappedKey: wrappedKeyFor(v.id, userId),
  }
}

export function toFileDto(f: MockFile, userId: string): FileDto | null {
  const v = currentVersion(f.id)
  if (!v) return null
  const holders = db.wrappedKeys.filter((w) => w.versionId === v.id)
  return {
    id: f.id,
    vaultId: f.vaultId,
    vaultName: db.vaults.find((x) => x.id === f.vaultId)?.name ?? '',
    encName: f.encName,
    nameIv: f.nameIv,
    mimeType: f.mimeType,
    sizeBytes: v.sizeBytes,
    ownerId: f.ownerId,
    ownerName: userName(f.ownerId),
    state: f.state === 'trashed' ? 'trashed' : 'active',
    isFavorite: db.favorites.some((x) => x.userId === userId && x.fileId === f.id),
    deletedAt: f.deletedAt,
    deletedBy: f.deletedBy ? { id: f.deletedBy, displayName: userName(f.deletedBy) } : null,
    purgeAt: f.deletedAt ? purgeAtOf(f.deletedAt) : null,
    updatedAt: f.updatedAt,
    updatedBy: { id: v.createdBy, displayName: userName(v.createdBy) },
    currentVersion: toVersionDto(v, userId),
    people: holders.map((h) => ({ userId: h.userId, displayName: userName(h.userId) })),
  }
}

// counts for VaultDto: only files that finished uploading and aren't in the trash
export function vaultStats(vaultId: string) {
  const live = db.files.filter((f) => f.vaultId === vaultId && f.state === 'active')
  let sizeBytes = 0
  let fileCount = 0
  for (const f of live) {
    const v = currentVersion(f.id)
    if (!v) continue
    fileCount++
    sizeBytes += v.sizeBytes
  }
  return { fileCount, sizeBytes }
}

export function storageUrl(storagePfx: string, index: number) {
  // stands in for an S3 presigned URL; the signature isn't checked by the mock
  const sig = Math.random().toString(36).slice(2, 10)
  return `${location.origin}/__storage/${storagePfx}/${index}?X-Amz-Expires=900&X-Amz-Signature=${sig}`
}
