import { delay, http, HttpResponse } from 'msw'
import type { ErrorCode } from '@/api/types'
import { db, save, type MockFile } from '../db'
import { appendAudit } from '../audit'
import { accessOf, canWrite, committedVersions, holdersOf, roleOf, toFileDto } from '../fileHelpers'
import { purgeFile, restoreFile, setFavorite, trashFile } from '../fileOps'
import { API, authenticate, invalid, problem } from './utils'

// rename, move, trash, restore, purge and the star: everything that changes one file

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  FORBIDDEN_ROLE: 'Your role in this vault does not allow that.',
  VALIDATION_FAILED: 'The file is not in a state that allows that.',
  NOT_FOUND: 'File not found.',
}

function failWith(code: ErrorCode) {
  const status = code === 'FORBIDDEN_ROLE' ? 403 : code === 'NOT_FOUND' ? 404 : 400
  return problem(status, code, MESSAGES[code] ?? 'Not possible.')
}

function findFile(fileId: string, userId: string): MockFile | null {
  const file = db.files.find((f) => f.id === fileId && f.state !== 'uploading')
  return file && accessOf(file, userId) ? file : null
}

type MoveBody = {
  targetVaultId: string
  wrappedKeys: { versionId: string; userId: string; keyVersion: number; wrapped: string }[]
}

export const fileActionHandlers = [
  // the new name arrives already sealed with the current version's key
  http.patch(`${API}/files/:fileId`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const file = findFile(String(params.fileId), auth.user.id)
    if (!file || file.state !== 'active') return failWith('NOT_FOUND')
    if (!canWrite(accessOf(file, auth.user.id))) return failWith('FORBIDDEN_ROLE')

    const body = (await request.json()) as { encName?: string; nameIv?: string }
    if (!body.encName || !body.nameIv) return invalid('encName', 'encName and nameIv are required.')
    file.encName = body.encName
    file.nameIv = body.nameIv
    file.updatedAt = new Date().toISOString()
    await appendAudit(auth.user.id, 'file.rename', 'file', file.id)
    save()
    return HttpResponse.json(toFileDto(file, auth.user.id))
  }),

  // the browser re-wrapped every version's key for the target vault's members
  http.post(`${API}/files/:fileId/move`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const file = findFile(String(params.fileId), auth.user.id)
    if (!file || file.state !== 'active') return failWith('NOT_FOUND')

    const body = (await request.json()) as MoveBody
    const target = db.vaults.find((v) => v.id === body.targetVaultId)
    if (!target || !roleOf(target.id, auth.user.id))
      return problem(404, 'NOT_FOUND', 'Vault not found.')
    if (target.id === file.vaultId) return invalid('targetVaultId', 'The file is already there.')
    if (
      !canWrite(roleOf(file.vaultId, auth.user.id)) ||
      !canWrite(roleOf(target.id, auth.user.id))
    ) {
      return problem(
        403,
        'FORBIDDEN_ROLE',
        'You need to be an editor in both vaults to move a file.',
      )
    }

    const versions = committedVersions(file.id)
    // the target vault's members, plus whoever the file is shared with directly
    const recipients = holdersOf(file.id, target.id)
    const given = body.wrappedKeys ?? []
    const missing = versions.some((v) =>
      recipients.some((r) => !given.some((k) => k.versionId === v.id && k.userId === r.id)),
    )
    if (missing) {
      return problem(
        422,
        'MISSING_WRAPPED_KEYS',
        'Every version needs a key for every member of the target vault.',
      )
    }

    const ids = new Set(versions.map((v) => v.id))
    db.wrappedKeys = db.wrappedKeys
      .filter((w) => !ids.has(w.versionId))
      .concat(
        given
          .filter((k) => ids.has(k.versionId) && recipients.some((r) => r.id === k.userId))
          .map((k) => ({
            versionId: k.versionId,
            userId: k.userId,
            keyVersion: k.keyVersion,
            wrapped: k.wrapped,
          })),
      )
    file.vaultId = target.id
    file.updatedAt = new Date().toISOString()
    await appendAudit(auth.user.id, 'file.move', 'file', file.id)
    save()
    return HttpResponse.json(toFileDto(file, auth.user.id))
  }),

  http.delete(`${API}/files/:fileId`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const file = findFile(String(params.fileId), auth.user.id)
    if (!file) return failWith('NOT_FOUND')
    const code = await trashFile(file, auth.user.id)
    if (code) return failWith(code)
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${API}/files/:fileId/restore`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const file = findFile(String(params.fileId), auth.user.id)
    if (!file) return failWith('NOT_FOUND')
    const code = await restoreFile(file, auth.user.id)
    if (code) return failWith(code)
    save()
    return HttpResponse.json(toFileDto(file, auth.user.id))
  }),

  http.delete(`${API}/files/:fileId/purge`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const file = findFile(String(params.fileId), auth.user.id)
    if (!file) return failWith('NOT_FOUND')
    const code = await purgeFile(file, auth.user.id)
    if (code) return failWith(code)
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.put(`${API}/files/:fileId/favorite`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const file = findFile(String(params.fileId), auth.user.id)
    if (!file) return failWith('NOT_FOUND')
    setFavorite(file, auth.user.id, true)
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete(`${API}/files/:fileId/favorite`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const file = findFile(String(params.fileId), auth.user.id)
    if (!file) return failWith('NOT_FOUND')
    setFavorite(file, auth.user.id, false)
    save()
    return new HttpResponse(null, { status: 204 })
  }),
]
