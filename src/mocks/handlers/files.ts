import { delay, http, HttpResponse } from 'msw'
import type {
  AuditEntryDto,
  CommitRequest,
  FileAccessEntry,
  FileDetailDto,
  UploadInitRequest,
} from '@/api/types'
import { db, save } from '../db'
import { appendAudit } from '../audit'
import { deleteBlob, getBlob, putBlob } from '../blobStore'
import { purgeExpired } from '../fileOps'
import {
  accessOf,
  canWrite,
  committedVersions,
  currentVersion,
  holdersOf,
  roleOf,
  shareOf,
  storageUrl,
  toFileDto,
  toVersionDto,
  userName,
  wrappedKeyFor,
} from '../fileHelpers'
import { API, authenticate, invalid, newId, now, problem } from './utils'

const MAX_CHUNKS = 1280 // 5 GiB at 4 MiB per chunk, same limit the design shows

// members of the vault, or someone the file was shared with
function findFileFor(fileId: string, userId: string) {
  const file = db.files.find((f) => f.id === fileId && f.state !== 'uploading')
  if (!file || !accessOf(file, userId)) return null
  return file
}

export const fileHandlers = [
  http.get(`${API}/vaults/:vaultId/files`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const vaultId = String(params.vaultId)
    if (!roleOf(vaultId, auth.user.id)) return problem(404, 'NOT_FOUND', 'Vault not found.')

    if (await purgeExpired()) save()
    const state =
      new URL(request.url).searchParams.get('state') === 'trashed' ? 'trashed' : 'active'
    const items = db.files
      .filter((f) => f.vaultId === vaultId && f.state === state)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((f) => toFileDto(f, auth.user.id))
      .filter((f) => f !== null)
    return HttpResponse.json({ items, total: items.length })
  }),

  // step 1 of an upload: ids first, because the chunks' AAD needs them before encryption
  http.post(`${API}/vaults/:vaultId/uploads`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const vaultId = String(params.vaultId)
    const body = (await request.json()) as UploadInitRequest
    // new files need a vault role; a new version of a shared file is fine with an editor share
    const role =
      roleOf(vaultId, auth.user.id) ??
      (body.fileId ? shareOf(body.fileId, auth.user.id)?.role : undefined)
    if (!role) return problem(404, 'NOT_FOUND', 'Vault not found.')
    if (!canWrite(role))
      return problem(403, 'FORBIDDEN_ROLE', 'Viewers can read files but not upload.')

    if (!Number.isInteger(body.chunkCount) || body.chunkCount < 1 || body.chunkCount > MAX_CHUNKS) {
      return invalid('chunkCount', 'Files are limited to 5 GB.')
    }

    let fileId = body.fileId
    if (fileId) {
      const file = db.files.find(
        (f) => f.id === fileId && f.vaultId === vaultId && f.state === 'active',
      )
      if (!file) return problem(404, 'NOT_FOUND', 'That file is not in this vault.')
    } else {
      fileId = newId()
      db.files.push({
        id: fileId,
        vaultId,
        encName: '',
        nameIv: '',
        mimeType: body.mimeType || 'application/octet-stream',
        ownerId: auth.user.id,
        state: 'uploading',
        deletedAt: null,
        deletedBy: null,
        createdAt: now(),
        updatedAt: now(),
      })
    }

    const versionId = newId()
    const versionNo = (committedVersions(fileId)[0]?.versionNo ?? 0) + 1
    const storagePfx = `v/${versionId}`
    db.versions.push({
      id: versionId,
      fileId,
      versionNo,
      sizeBytes: body.sizeBytes,
      chunkCount: body.chunkCount,
      digest: '',
      encNote: null,
      noteIv: null,
      storagePfx,
      committed: false,
      createdAt: now(),
      createdBy: auth.user.id,
    })
    save()

    return HttpResponse.json({
      fileId,
      versionId,
      versionNo,
      uploadUrls: Array.from({ length: body.chunkCount }, (_, index) => ({
        index,
        url: storageUrl(storagePfx, index),
      })),
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    })
  }),

  // step 3: chunk metadata + one wrapped key per member, all in one go
  http.post(`${API}/uploads/:versionId/commit`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const version = db.versions.find((v) => v.id === params.versionId)
    if (!version || version.committed || version.createdBy !== auth.user.id) {
      return problem(404, 'NOT_FOUND', 'No open upload with that id.')
    }
    const file = db.files.find((f) => f.id === version.fileId)!
    const body = (await request.json()) as CommitRequest

    if (body.chunks?.length !== version.chunkCount) {
      return problem(422, 'UPLOAD_INCOMPLETE', 'Chunk list does not match the upload.')
    }
    for (let i = 0; i < version.chunkCount; i++) {
      if (!(await getBlob(`${version.storagePfx}/${i}`))) {
        return problem(422, 'UPLOAD_INCOMPLETE', `Chunk ${i + 1} never reached storage.`)
      }
    }

    // every member (and everyone it's shared with) must get a key, or they'd be locked out
    const needed = holdersOf(file.id, file.vaultId)
    const given = new Set((body.wrappedKeys ?? []).map((k) => k.userId))
    const missing = needed.filter((u) => !given.has(u.id))
    if (missing.length) {
      return problem(
        422,
        'MISSING_WRAPPED_KEYS',
        `No wrapped key for ${missing.map((u) => u.email).join(', ')}.`,
      )
    }

    db.chunks.push(...body.chunks.map((c) => ({ versionId: version.id, ...c })))
    db.wrappedKeys.push(...body.wrappedKeys.map((k) => ({ versionId: version.id, ...k })))
    version.committed = true
    version.digest = body.digest
    version.encNote = body.encNote ?? null
    version.noteIv = body.noteIv ?? null
    version.createdAt = now()
    file.encName = body.encName
    file.nameIv = body.nameIv
    file.state = 'active'
    file.updatedAt = version.createdAt
    db.access.push({ userId: auth.user.id, fileId: file.id, action: 'upload', at: now() })
    await appendAudit(
      auth.user.id,
      version.versionNo === 1 ? 'file.upload' : 'file.version',
      'file',
      file.id,
    )
    save()
    return HttpResponse.json(toFileDto(file, auth.user.id))
  }),

  http.delete(`${API}/uploads/:versionId`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const version = db.versions.find((v) => v.id === params.versionId && !v.committed)
    if (!version || version.createdBy !== auth.user.id)
      return new HttpResponse(null, { status: 204 })

    for (let i = 0; i < version.chunkCount; i++) await deleteBlob(`${version.storagePfx}/${i}`)
    db.versions = db.versions.filter((v) => v.id !== version.id)
    // a brand new file with nothing committed disappears with its upload
    db.files = db.files.filter((f) => !(f.id === version.fileId && f.state === 'uploading'))
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/files/:fileId`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const file = findFileFor(String(params.fileId), auth.user.id)
    const dto = file && toFileDto(file, auth.user.id)
    if (!file || !dto) return problem(404, 'NOT_FOUND', 'File not found.')

    const current = currentVersion(file.id)!
    const person = (id: string) => db.users.find((x) => x.id === id)!
    const access: FileAccessEntry[] = [
      ...db.members
        .filter((m) => m.vaultId === file.vaultId)
        .map((m) => ({
          userId: m.userId,
          displayName: person(m.userId).displayName,
          email: person(m.userId).email,
          role: m.role,
          source: 'vault' as const,
          hasKey: Boolean(wrappedKeyFor(current.id, m.userId)),
        })),
      ...db.shares
        .filter((sh) => sh.fileId === file.id && shareOf(file.id, sh.userId))
        .map((sh) => ({
          userId: sh.userId,
          displayName: person(sh.userId).displayName,
          email: person(sh.userId).email,
          role: sh.role,
          source: 'share' as const,
          hasKey: Boolean(wrappedKeyFor(current.id, sh.userId)),
        })),
    ]
    const recentActivity: AuditEntryDto[] = db.audit
      .filter((e) => e.resourceId === file.id)
      .slice(-5)
      .reverse()
      .map((e) => ({ ...e, actorName: e.actorId ? userName(e.actorId) : null }))

    const body: FileDetailDto = {
      file: dto,
      access,
      wrappedKeyCount: db.wrappedKeys.filter((w) => w.versionId === current.id).length,
      versionCount: committedVersions(file.id).length,
      recentActivity,
      myRole: accessOf(file, auth.user.id)!,
      via: roleOf(file.vaultId, auth.user.id) ? 'vault' : 'share',
    }
    return HttpResponse.json(body)
  }),

  http.get(`${API}/files/:fileId/versions`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const file = findFileFor(String(params.fileId), auth.user.id)
    if (!file) return problem(404, 'NOT_FOUND', 'File not found.')
    return HttpResponse.json(committedVersions(file.id).map((v) => toVersionDto(v, auth.user.id)))
  }),

  http.get(`${API}/files/:fileId/versions/:versionId/download`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const file = findFileFor(String(params.fileId), auth.user.id)
    const version = db.versions.find(
      (v) => v.id === params.versionId && v.fileId === file?.id && v.committed,
    )
    if (!file || !version) return problem(404, 'NOT_FOUND', 'Version not found.')

    // the cryptographic layer: no wrapped key, nothing useful to hand out
    const wrappedKey = wrappedKeyFor(version.id, auth.user.id)
    if (!wrappedKey) return problem(403, 'FORBIDDEN_ROLE', 'You hold no key for this version.')

    db.access.push({ userId: auth.user.id, fileId: file.id, action: 'download', at: now() })
    await appendAudit(auth.user.id, 'file.download', 'file', file.id)
    save()

    const chunks = db.chunks
      .filter((c) => c.versionId === version.id)
      .sort((a, b) => a.index - b.index)
      .map((c) => ({
        index: c.index,
        iv: c.iv,
        tag: c.tag,
        digest: c.digest,
        url: storageUrl(version.storagePfx, c.index),
      }))
    return HttpResponse.json({
      versionId: version.id,
      mimeType: file.mimeType,
      sizeBytes: version.sizeBytes,
      chunkCount: version.chunkCount,
      wrappedKey,
      chunks,
    })
  }),
]

// the fake S3 bucket behind the presigned URLs
const keyFrom = (url: string) =>
  decodeURIComponent(new URL(url).pathname.replace(/^\/__storage\//, ''))

export const storageHandlers = [
  http.put('/__storage/*', async ({ request }) => {
    await delay(40)
    await putBlob(keyFrom(request.url), new Uint8Array(await request.arrayBuffer()))
    return new HttpResponse(null, { status: 200, headers: { ETag: `"${newId()}"` } })
  }),

  http.get('/__storage/*', async ({ request }) => {
    await delay(40)
    const bytes = await getBlob(keyFrom(request.url))
    if (!bytes) return new HttpResponse('NoSuchKey', { status: 404 })
    return new HttpResponse(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })
  }),
]
