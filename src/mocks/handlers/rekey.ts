import { delay, http, HttpResponse } from 'msw'
import type { RekeyCommitRequest, RekeyInitResponse } from '@/api/types'
import { db, save } from '../db'
import { appendAudit } from '../audit'
import { deleteBlob, getBlob } from '../blobStore'
import { canManage, currentVersion, holdersOf, roleOf, storageUrl } from '../fileHelpers'
import { API, authenticate, invalid, newId, problem } from './utils'

/*
  Key rotation after a revoke: the browser re-encrypts one version under a
  fresh data key and uploads it next to the old one; commit swaps them in
  one go and deletes the old bytes. Links to that version die with the old
  key (their sealed copy was of it).
*/

function versionFor(versionId: string, userId: string) {
  const version = db.versions.find((v) => v.id === versionId && v.committed)
  const file = version && db.files.find((f) => f.id === version.fileId)
  if (!version || !file || !roleOf(file.vaultId, userId)) return null
  return { version, file }
}

export const rekeyHandlers = [
  http.post(`${API}/versions/:versionId/rekey`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const found = versionFor(String(params.versionId), auth.user.id)
    if (!found) return problem(404, 'NOT_FOUND', 'Version not found.')
    if (!canManage(roleOf(found.file.vaultId, auth.user.id))) {
      return problem(403, 'FORBIDDEN_ROLE', 'Only owners and managers can rotate keys.')
    }
    const body = (await request.json()) as { chunkCount: number }
    if (body.chunkCount !== found.version.chunkCount) {
      return invalid('chunkCount', 'The chunk count must stay the same.')
    }

    const rekey = {
      id: newId(),
      versionId: found.version.id,
      storagePfx: `v/${found.version.id}/rk-${Date.now().toString(36)}`,
      chunkCount: body.chunkCount,
      createdBy: auth.user.id,
    }
    db.rekeys.push(rekey)
    save()
    const res: RekeyInitResponse = {
      rekeyId: rekey.id,
      uploadUrls: Array.from({ length: body.chunkCount }, (_, index) => ({
        index,
        url: storageUrl(rekey.storagePfx, index),
      })),
      recipients: holdersOf(found.file.id, found.file.vaultId).map((u) => ({
        userId: u.id,
        publicKey: u.publicKey,
        keyVersion: u.keyVersion,
      })),
    }
    return HttpResponse.json(res)
  }),

  http.post(`${API}/versions/:versionId/rekey/:rekeyId/commit`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const found = versionFor(String(params.versionId), auth.user.id)
    const rekey = db.rekeys.find((r) => r.id === params.rekeyId && r.createdBy === auth.user.id)
    if (!found || !rekey || rekey.versionId !== found.version.id) {
      return problem(404, 'NOT_FOUND', 'No open rotation with that id.')
    }
    const { version, file } = found
    const body = (await request.json()) as RekeyCommitRequest

    if (body.chunks?.length !== rekey.chunkCount) {
      return problem(422, 'UPLOAD_INCOMPLETE', 'Chunk list does not match.')
    }
    for (let i = 0; i < rekey.chunkCount; i++) {
      if (!(await getBlob(`${rekey.storagePfx}/${i}`))) {
        return problem(422, 'UPLOAD_INCOMPLETE', `Chunk ${i + 1} never reached storage.`)
      }
    }
    const holders = holdersOf(file.id, file.vaultId)
    const given = body.wrappedKeys ?? []
    if (holders.some((u) => !given.some((k) => k.userId === u.id))) {
      return problem(422, 'MISSING_WRAPPED_KEYS', 'Every current member needs the new key.')
    }
    if (version.encNote && !body.encNote) return invalid('encNote', 'Re-seal the note too.')
    const isCurrent = currentVersion(file.id)?.id === version.id
    if (isCurrent && !body.encName) return invalid('encName', 'Re-seal the name too.')

    // swap: new bytes, chunk rows, digest and keys; the old ones go
    for (let i = 0; i < version.chunkCount; i++) await deleteBlob(`${version.storagePfx}/${i}`)
    db.chunks = db.chunks
      .filter((c) => c.versionId !== version.id)
      .concat(body.chunks.map((c) => ({ versionId: version.id, ...c })))
    db.wrappedKeys = db.wrappedKeys
      .filter((w) => w.versionId !== version.id)
      .concat(
        given
          .filter((k) => holders.some((u) => u.id === k.userId))
          .map((k) => ({
            versionId: version.id,
            userId: k.userId,
            keyVersion: k.keyVersion,
            wrapped: k.wrapped,
          })),
      )
    version.storagePfx = rekey.storagePfx
    version.digest = body.digest
    if (body.encNote) {
      version.encNote = body.encNote
      version.noteIv = body.noteIv ?? null
    }
    if (isCurrent && body.encName) {
      file.encName = body.encName
      file.nameIv = body.nameIv!
    }
    for (const l of db.links.filter((x) => x.versionId === version.id && !x.revoked)) {
      l.revoked = true
      l.reWrapped = null
    }
    db.rekeys = db.rekeys.filter((r) => r !== rekey)
    await appendAudit(auth.user.id, 'rekey.version', 'version', version.id)
    save()
    return new HttpResponse(null, { status: 204 })
  }),
]
