import { delay, http, HttpResponse } from 'msw'
import type {
  CreateLinkRequest,
  CreateShareRequest,
  FileShareDto,
  IncomingShare,
  LinkDto,
  OutgoingShare,
  PublicLinkDownload,
  PublicLinkDto,
  ShareDto,
  ShareRole,
} from '@/api/types'
import { db, save, type MockFile, type MockLink, type MockShare } from '../db'
import { appendAudit } from '../audit'
import { randomToken } from '../hash'
import {
  canManage,
  committedVersions,
  roleOf,
  shareOf,
  storageUrl,
  toFileDto,
  userName,
} from '../fileHelpers'
import { API, authenticate, checkStepUp, invalid, newId, now, problem } from './utils'

/*
  Direct shares and secure links. Granting, changing and revoking access and
  creating / revoking links all need a fresh step-up (FR-17).
*/

const ROLES: ShareRole[] = ['viewer', 'editor']

const person = (id: string) => db.users.find((u) => u.id === id)!

function liveFile(fileId: string) {
  return db.files.find((f) => f.id === fileId && f.state === 'active')
}

function toShareDto(s: MockShare): ShareDto {
  return { userId: s.userId, role: s.role, sharedAt: s.sharedAt, expiresAt: s.expiresAt }
}

function toLinkDto(l: MockLink): LinkDto {
  return {
    id: l.id,
    token: l.token,
    fileId: l.fileId,
    versionId: l.versionId,
    expiresAt: l.expiresAt,
    maxDownloads: l.maxDownloads,
    downloads: l.downloads,
    hasPassphrase: l.passphraseSalt !== null,
    requireSignIn: l.requireSignIn,
    allowDownload: l.allowDownload,
    revoked: l.revoked,
    createdAt: l.createdAt,
  }
}

// a link is usable while it isn't revoked, expired, used up, or pointing at a file that's gone
function openLink(token: string) {
  const l = db.links.find((x) => x.token === token)
  if (!l || l.revoked || !l.reWrapped || l.expiresAt < now()) return null
  if (l.maxDownloads > 0 && l.downloads >= l.maxDownloads) return null
  const file = liveFile(l.fileId)
  const version = db.versions.find((v) => v.id === l.versionId && v.committed)
  if (!file || !version) return null
  return { link: l, file, version }
}

// one answer for every reason, so the link itself tells nobody anything
const gone = () => problem(410, 'LINK_GONE', 'This link no longer works.')

function onlyManagers(file: MockFile, userId: string) {
  return canManage(roleOf(file.vaultId, userId))
    ? null
    : problem(403, 'FORBIDDEN_ROLE', 'Only owners and managers of the vault can share it.')
}

export const sharingHandlers = [
  http.get(`${API}/files/:fileId/shares`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const file = liveFile(String(params.fileId))
    if (!file || !(roleOf(file.vaultId, auth.user.id) || shareOf(file.id, auth.user.id))) {
      return problem(404, 'NOT_FOUND', 'File not found.')
    }
    const list: FileShareDto[] = db.shares
      .filter((s) => s.fileId === file.id && shareOf(file.id, s.userId))
      .map((s) => {
        const u = person(s.userId)
        return {
          ...toShareDto(s),
          email: u.email,
          displayName: u.displayName,
          sharedBy: { id: s.sharedBy, displayName: userName(s.sharedBy) },
          publicKey: u.publicKey,
          keyVersion: u.keyVersion,
          fingerprint: u.fingerprint,
        }
      })
    return HttpResponse.json(list)
  }),

  // the browser already re-wrapped every version's key for the recipient
  http.post(`${API}/files/:fileId/shares`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const file = liveFile(String(params.fileId))
    if (!file || !roleOf(file.vaultId, auth.user.id))
      return problem(404, 'NOT_FOUND', 'File not found.')
    const denied = onlyManagers(file, auth.user.id)
    if (denied) return denied
    const stepUp = checkStepUp(request, auth.user.id, 'share.grant')
    if (stepUp) return stepUp

    const body = (await request.json()) as CreateShareRequest
    const to = db.users.find((u) => u.id === body.userId && u.status === 'active' && u.publicKey)
    if (!to) return problem(404, 'USER_NOT_FOUND', 'That person has no VaultShare keys yet.')
    if (!ROLES.includes(body.role)) return invalid('role', 'Viewer or editor.')
    if (roleOf(file.vaultId, to.id)) {
      return problem(409, 'ALREADY_MEMBER', `${to.displayName} is already a member of this vault.`)
    }
    const versions = committedVersions(file.id)
    const given = body.wrappedKeys ?? []
    if (versions.some((v) => !given.some((k) => k.versionId === v.id))) {
      return problem(422, 'MISSING_WRAPPED_KEYS', 'Every version needs a wrapped key for them.')
    }

    const ids = new Set(versions.map((v) => v.id))
    db.wrappedKeys = db.wrappedKeys
      .filter((w) => !(w.userId === to.id && ids.has(w.versionId)))
      .concat(
        given
          .filter((k) => ids.has(k.versionId))
          .map((k) => ({
            versionId: k.versionId,
            userId: to.id,
            keyVersion: k.keyVersion,
            wrapped: k.wrapped,
          })),
      )
    db.shares = db.shares.filter((s) => !(s.fileId === file.id && s.userId === to.id))
    const share: MockShare = {
      fileId: file.id,
      userId: to.id,
      role: body.role,
      sharedBy: auth.user.id,
      sharedAt: now(),
      expiresAt: body.expiresAt ?? null,
    }
    db.shares.push(share)
    await appendAudit(auth.user.id, 'share.grant', 'file', file.id)
    save()
    return HttpResponse.json(toShareDto(share), { status: 201 })
  }),

  http.patch(`${API}/files/:fileId/shares/:userId`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const file = liveFile(String(params.fileId))
    if (!file || !roleOf(file.vaultId, auth.user.id))
      return problem(404, 'NOT_FOUND', 'File not found.')
    const denied = onlyManagers(file, auth.user.id)
    if (denied) return denied
    const stepUp = checkStepUp(request, auth.user.id, 'share.change')
    if (stepUp) return stepUp

    const share = db.shares.find((s) => s.fileId === file.id && s.userId === params.userId)
    if (!share) return problem(404, 'NOT_FOUND', 'No such share.')
    const body = (await request.json()) as { role: ShareRole }
    if (!ROLES.includes(body.role)) return invalid('role', 'Viewer or editor.')
    share.role = body.role
    await appendAudit(auth.user.id, 'share.change', 'file', file.id)
    save()
    return HttpResponse.json(toShareDto(share))
  }),

  // deletes the recipient's wrapped keys; the versions they could read come back for re-keying
  http.delete(`${API}/files/:fileId/shares/:userId`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const file = db.files.find((f) => f.id === params.fileId)
    if (!file || !roleOf(file.vaultId, auth.user.id))
      return problem(404, 'NOT_FOUND', 'File not found.')
    const denied = onlyManagers(file, auth.user.id)
    if (denied) return denied
    const stepUp = checkStepUp(request, auth.user.id, 'share.revoke')
    if (stepUp) return stepUp

    const userId = String(params.userId)
    const versions = committedVersions(file.id)
    const ids = new Set(versions.map((v) => v.id))
    const affected = versions
      .filter((v) => db.wrappedKeys.some((w) => w.versionId === v.id && w.userId === userId))
      .map((v) => ({ fileId: file.id, versionId: v.id }))
    db.shares = db.shares.filter((s) => !(s.fileId === file.id && s.userId === userId))
    db.wrappedKeys = db.wrappedKeys.filter((w) => !(w.userId === userId && ids.has(w.versionId)))
    await appendAudit(auth.user.id, 'share.revoke', 'file', file.id)
    save()
    return HttpResponse.json({ affectedVersions: affected })
  }),

  http.get(`${API}/shares/incoming`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const list: IncomingShare[] = []
    for (const s of db.shares.filter((x) => x.userId === auth.user.id)) {
      const file = liveFile(s.fileId)
      const dto = file && shareOf(file.id, auth.user.id) && toFileDto(file, auth.user.id)
      if (!dto) continue
      const by = person(s.sharedBy)
      list.push({
        file: dto,
        sharedBy: { id: by.id, displayName: by.displayName, email: by.email },
        role: s.role,
        sharedAt: s.sharedAt,
        expiresAt: s.expiresAt,
      })
    }
    list.sort((a, b) => b.sharedAt.localeCompare(a.sharedAt))
    return HttpResponse.json(list)
  }),

  http.get(`${API}/shares/outgoing`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const list: OutgoingShare[] = []
    for (const s of db.shares.filter((x) => x.sharedBy === auth.user.id)) {
      const file = liveFile(s.fileId)
      const dto = file && toFileDto(file, auth.user.id)
      if (!dto) continue
      const to = person(s.userId)
      const lastUsed = db.access
        .filter((a) => a.userId === s.userId && a.fileId === s.fileId && a.action === 'download')
        .sort((a, b) => b.at.localeCompare(a.at))[0]
      list.push({
        file: dto,
        recipient: { id: to.id, displayName: to.displayName, email: to.email },
        role: s.role,
        sharedAt: s.sharedAt,
        expiresAt: s.expiresAt,
        lastUsedAt: lastUsed?.at ?? null,
      })
    }
    list.sort((a, b) => b.sharedAt.localeCompare(a.sharedAt))
    return HttpResponse.json(list)
  }),

  // ---- secure links ----

  http.post(`${API}/files/:fileId/links`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const file = liveFile(String(params.fileId))
    if (!file || !roleOf(file.vaultId, auth.user.id))
      return problem(404, 'NOT_FOUND', 'File not found.')
    const denied = onlyManagers(file, auth.user.id)
    if (denied) return denied
    const stepUp = checkStepUp(request, auth.user.id, 'link.create')
    if (stepUp) return stepUp

    const body = (await request.json()) as CreateLinkRequest
    const version = db.versions.find(
      (v) => v.id === body.versionId && v.fileId === file.id && v.committed,
    )
    if (!version) return invalid('versionId', 'Pick a version of this file.')
    if (!body.reWrapped || !body.encName || !body.nameIv)
      return invalid('reWrapped', 'Sealed key and name are required.')
    const days = (new Date(body.expiresAt).getTime() - Date.now()) / 86_400_000
    if (!(days > 0 && days <= 90))
      return invalid('expiresAt', 'Links last between a day and 90 days.')

    const link: MockLink = {
      id: newId(),
      // 32 random characters: an unguessable pointer, but no key material
      token: randomToken(16),
      fileId: file.id,
      versionId: version.id,
      createdBy: auth.user.id,
      reWrapped: body.reWrapped,
      passphraseSalt: body.passphraseSalt ?? null,
      encName: body.encName,
      nameIv: body.nameIv,
      expiresAt: body.expiresAt,
      maxDownloads: Math.max(0, body.maxDownloads | 0),
      downloads: 0,
      requireSignIn: Boolean(body.requireSignIn),
      allowDownload: body.allowDownload !== false,
      revoked: false,
      createdAt: now(),
    }
    db.links.push(link)
    await appendAudit(auth.user.id, 'link.create', 'link', link.id)
    save()
    return HttpResponse.json(toLinkDto(link), { status: 201 })
  }),

  http.get(`${API}/links`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const mine = db.links
      .filter((l) => l.createdBy === auth.user.id && liveFile(l.fileId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return HttpResponse.json(mine.map(toLinkDto))
  }),

  http.delete(`${API}/links/:linkId`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const link = db.links.find((l) => l.id === params.linkId)
    const file = link && db.files.find((f) => f.id === link.fileId)
    if (!link || !file) return problem(404, 'NOT_FOUND', 'No such link.')
    if (link.createdBy !== auth.user.id && !canManage(roleOf(file.vaultId, auth.user.id))) {
      return problem(403, 'FORBIDDEN_ROLE', 'Only the creator or a manager can revoke it.')
    }
    const stepUp = checkStepUp(request, auth.user.id, 'link.revoke')
    if (stepUp) return stepUp
    // the sealed key goes: the URL now points at bytes nobody can open
    link.revoked = true
    link.reWrapped = null
    await appendAudit(auth.user.id, 'link.revoke', 'link', link.id)
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  // public: no session needed unless the link asks for one
  http.get(`${API}/public/links/:token`, async ({ request, params }) => {
    await delay()
    const open = openLink(String(params.token))
    if (!open) return gone()
    if (open.link.requireSignIn) {
      const auth = authenticate(request)
      if (auth.error) return auth.error
    }
    const { link, version } = open
    const body: PublicLinkDto = {
      fileId: link.fileId,
      versionId: version.id,
      mimeType: open.file.mimeType,
      sizeBytes: version.sizeBytes,
      chunkCount: version.chunkCount,
      encName: link.encName,
      nameIv: link.nameIv,
      reWrapped: link.reWrapped!,
      passphraseSalt: link.passphraseSalt,
      expiresAt: link.expiresAt,
      downloadsLeft: link.maxDownloads > 0 ? link.maxDownloads - link.downloads : null,
      allowDownload: link.allowDownload,
    }
    return HttpResponse.json(body)
  }),

  http.post(`${API}/public/links/:token/download`, async ({ request, params }) => {
    await delay()
    const open = openLink(String(params.token))
    if (!open) return gone()
    let actor: string | null = null
    if (open.link.requireSignIn) {
      const auth = authenticate(request)
      if (auth.error) return auth.error
      actor = auth.user.id
    }
    const { link, version } = open
    link.downloads++
    await appendAudit(actor, 'link.download', 'link', link.id)
    save()
    const body: PublicLinkDownload = {
      chunks: db.chunks
        .filter((c) => c.versionId === version.id)
        .sort((a, b) => a.index - b.index)
        .map((c) => ({
          index: c.index,
          iv: c.iv,
          tag: c.tag,
          digest: c.digest,
          url: storageUrl(version.storagePfx, c.index),
        })),
    }
    return HttpResponse.json(body)
  }),
]
