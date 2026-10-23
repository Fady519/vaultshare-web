import type { BulkAction, ErrorCode } from '@/api/types'
import { db, type MockFile } from './db'
import { appendAudit } from './audit'
import { deleteBlob } from './blobStore'
import { canManage, canWrite, purgeAtOf, roleOf } from './fileHelpers'

/*
  The file operations behind both the single endpoints and /files/bulk, so the
  rules (who may do what) live in one place. Each returns null or an error code.
*/

const now = () => new Date().toISOString()

export async function trashFile(file: MockFile, userId: string): Promise<ErrorCode | null> {
  if (!canWrite(roleOf(file.vaultId, userId))) return 'FORBIDDEN_ROLE'
  if (file.state !== 'active') return 'VALIDATION_FAILED'
  file.state = 'trashed'
  file.deletedAt = now()
  file.deletedBy = userId
  await appendAudit(userId, 'file.trash', 'file', file.id)
  return null
}

export async function restoreFile(file: MockFile, userId: string): Promise<ErrorCode | null> {
  if (!canWrite(roleOf(file.vaultId, userId))) return 'FORBIDDEN_ROLE'
  if (file.state !== 'trashed') return 'VALIDATION_FAILED'
  file.state = 'active'
  file.deletedAt = null
  file.deletedBy = null
  await appendAudit(userId, 'file.restore', 'file', file.id)
  return null
}

// only from the trash, and only owners / managers: there's no way back after this
export async function purgeFile(file: MockFile, userId: string | null): Promise<ErrorCode | null> {
  if (userId !== null && !canManage(roleOf(file.vaultId, userId))) return 'FORBIDDEN_ROLE'
  if (file.state !== 'trashed') return 'VALIDATION_FAILED'

  const versions = db.versions.filter((v) => v.fileId === file.id)
  const versionIds = new Set(versions.map((v) => v.id))
  // keys first, then the bytes: without a key the ciphertext is already noise
  db.wrappedKeys = db.wrappedKeys.filter((w) => !versionIds.has(w.versionId))
  for (const v of versions) {
    for (let i = 0; i < v.chunkCount; i++) await deleteBlob(`${v.storagePfx}/${i}`)
  }
  db.chunks = db.chunks.filter((c) => !versionIds.has(c.versionId))
  db.versions = db.versions.filter((v) => v.fileId !== file.id)
  db.favorites = db.favorites.filter((f) => f.fileId !== file.id)
  db.access = db.access.filter((a) => a.fileId !== file.id)
  db.files = db.files.filter((f) => f.id !== file.id)
  // audit entries stay: the chain is append-only
  await appendAudit(userId, 'file.purge', 'file', file.id)
  return null
}

export function setFavorite(file: MockFile, userId: string, on: boolean): ErrorCode | null {
  if (!roleOf(file.vaultId, userId)) return 'NOT_FOUND'
  db.favorites = db.favorites.filter((f) => !(f.userId === userId && f.fileId === file.id))
  if (on) db.favorites.push({ userId, fileId: file.id })
  return null
}

export function runBulk(action: BulkAction, file: MockFile, userId: string) {
  switch (action) {
    case 'trash':
      return trashFile(file, userId)
    case 'restore':
      return restoreFile(file, userId)
    case 'purge':
      return purgeFile(file, userId)
    case 'favorite':
      return setFavorite(file, userId, true)
    case 'unfavorite':
      return setFavorite(file, userId, false)
  }
}

// stands in for the nightly job: anything past its purge date goes
export async function purgeExpired() {
  const due = db.files.filter(
    (f) => f.state === 'trashed' && f.deletedAt && purgeAtOf(f.deletedAt) < now(),
  )
  for (const f of due) await purgeFile(f, null)
  return due.length
}
