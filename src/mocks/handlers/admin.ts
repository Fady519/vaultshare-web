import { delay, http, HttpResponse } from 'msw'
import type {
  AdminOverviewDto,
  AdminUserDto,
  AuditEntryDto,
  AuditExportDto,
  InvitationDto,
  Paged,
  StorageUsageDto,
  SystemRole,
  TeamMemberDto,
  UserStatus,
} from '@/api/types'
import { db, save, type MockAudit, type MockUser } from '../db'
import { appendAudit } from '../audit'
import { canManage, committedVersions, roleOf, userName } from '../fileHelpers'
import { revokeFamily } from '../session'
import { API, authenticate, checkStepUp, invalid, problem } from './utils'

/*
  Team, storage, the admin dashboard and the audit log. Admin pages need
  systemRole "admin"; the audit log is open to admins and auditors in full,
  and to owners / managers for their own vaults.
*/

// ciphertext of a file = every committed version (each version is stored on its own)
const fileBytes = (fileId: string) => committedVersions(fileId).reduce((n, v) => n + v.sizeBytes, 0)

const mfaOf = (userId: string) => [
  ...new Set(db.factors.filter((f) => f.userId === userId && f.confirmed).map((f) => f.type)),
]

function vaultsShared(userId: string) {
  return new Set(db.members.filter((m) => m.userId === userId).map((m) => m.vaultId))
}

function toTeamMember(u: MockUser): TeamMemberDto {
  return {
    userId: u.id,
    displayName: u.displayName,
    email: u.email,
    systemRole: u.systemRole,
    status: u.status,
    lastActiveAt: u.lastActiveAt,
    vaults: db.members
      .filter((m) => m.userId === u.id)
      .map((m) => ({
        vaultId: m.vaultId,
        name: db.vaults.find((v) => v.id === m.vaultId)?.name ?? '',
        role: m.role,
        status: m.status,
      })),
    mfa: mfaOf(u.id),
    fingerprint: u.publicKey ? u.fingerprint : null,
  }
}

// field by field: the dev tamper switch leaves a marker on the row that mustn't leak out
function toAuditDto(e: MockAudit): AuditEntryDto {
  return {
    seq: e.seq,
    timestamp: e.timestamp,
    actorId: e.actorId,
    actorName: e.actorId
      ? (db.users.find((u) => u.id === e.actorId)?.displayName ?? 'deleted account')
      : null,
    action: e.action,
    resourceType: e.resourceType,
    resourceId: e.resourceId,
    prevHash: e.prevHash,
    hash: e.hash,
  }
}

const isAdmin = (u: MockUser) => u.systemRole === 'admin'
const onlyAdmins = () => problem(403, 'FORBIDDEN_ROLE', 'Only administrators can see this.')

// what the caller may read of the audit chain
function auditScope(u: MockUser, vaultId: string | null) {
  if (u.systemRole === 'admin' || u.systemRole === 'auditor') {
    if (!vaultId) return () => true
  } else if (vaultId && !canManage(roleOf(vaultId, u.id))) {
    return null
  }
  if (!vaultId) return (e: { actorId: string | null }) => e.actorId === u.id
  const fileIds = new Set(db.files.filter((f) => f.vaultId === vaultId).map((f) => f.id))
  const versionIds = new Set(db.versions.filter((v) => fileIds.has(v.fileId)).map((v) => v.id))
  const linkIds = new Set(db.links.filter((l) => fileIds.has(l.fileId)).map((l) => l.id))
  return (e: { resourceId: string }) =>
    e.resourceId === vaultId ||
    fileIds.has(e.resourceId) ||
    versionIds.has(e.resourceId) ||
    linkIds.has(e.resourceId)
}

export const adminHandlers = [
  // people who share at least one vault with me; admins see everyone
  http.get(`${API}/team/members`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const mine = vaultsShared(auth.user.id)
    const people = db.users.filter(
      (u) =>
        isAdmin(auth.user) ||
        u.id === auth.user.id ||
        db.members.some((m) => m.userId === u.id && mine.has(m.vaultId)),
    )
    return HttpResponse.json(people.map(toTeamMember))
  }),

  http.get(`${API}/team/invitations`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const list: InvitationDto[] = db.invitations
      .filter(
        (i) =>
          i.invitedBy === auth.user.id &&
          i.status === 'pending' &&
          i.expiresAt > new Date().toISOString(),
      )
      .map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        vaultId: i.vaultId,
        vaultName: db.vaults.find((v) => v.id === i.vaultId)?.name ?? '',
        status: i.status,
        invitedBy: { id: auth.user.id, displayName: auth.user.displayName },
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
      }))
    return HttpResponse.json(list)
  }),

  // the vaults I'm in; quota is per person
  http.get(`${API}/storage/usage`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const vaults = db.vaults.filter((v) => roleOf(v.id, auth.user.id))
    let used = 0
    let trash = 0
    let chunks = 0
    const byVault = vaults.map((v) => {
      const files = db.files.filter((f) => f.vaultId === v.id && f.state !== 'uploading')
      let size = 0
      let versions = 0
      for (const f of files) {
        const b = fileBytes(f.id)
        size += b
        if (f.state === 'trashed') trash += b
        const vs = committedVersions(f.id)
        versions += vs.length
        chunks += vs.reduce((n, x) => n + x.chunkCount, 0)
      }
      used += size
      return {
        vaultId: v.id,
        name: v.name,
        sizeBytes: size,
        fileCount: files.filter((f) => f.state === 'active').length,
        versionCount: versions,
        memberCount: db.members.filter((m) => m.vaultId === v.id).length,
      }
    })
    const body: StorageUsageDto = {
      usedBytes: used,
      quotaBytes: db.settings.quotaBytes,
      // 12 bytes IV + 16 bytes tag per chunk
      overheadBytes: 28 * chunks,
      trashBytes: trash,
      retentionDays: db.settings.retentionDays,
      byVault,
    }
    return HttpResponse.json(body)
  }),

  http.put(`${API}/storage/retention`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    if (!isAdmin(auth.user)) return onlyAdmins()
    const { days } = (await request.json()) as { days: number }
    if (![7, 14, 30, 60, 90].includes(days)) return invalid('days', '7, 14, 30, 60 or 90 days.')
    db.settings.retentionDays = days
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/admin/overview`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    if (!isAdmin(auth.user)) return onlyAdmins()
    const users = db.users
    const day = (d: Date) => d.toISOString().slice(0, 10)
    const since = Date.now() - 13 * 86_400_000
    const activity = Array.from({ length: 14 }, (_, i) => {
      const date = day(new Date(since + i * 86_400_000))
      const on = db.audit.filter((e) => e.timestamp.slice(0, 10) === date)
      return {
        date,
        uploads: on.filter((e) => e.action === 'file.upload' || e.action === 'file.version').length,
        downloads: on.filter((e) => e.action === 'file.download' || e.action === 'link.download')
          .length,
        shares: on.filter((e) => e.action === 'share.grant' || e.action === 'link.create').length,
      }
    })
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const in14 = new Date(Date.now() + 14 * 86_400_000).toISOString()
    const body: AdminOverviewDto = {
      accounts: {
        total: users.length,
        active: users.filter((u) => u.status === 'active').length,
        pendingKeys: users.filter((u) => u.status === 'pendingKeys' || u.status === 'pendingMfa')
          .length,
        disabled: users.filter((u) => u.status === 'disabled').length,
      },
      storage: {
        usedBytes: db.files.reduce((n, f) => n + fileBytes(f.id), 0),
        quotaBytes: db.settings.quotaBytes * Math.max(1, users.length),
      },
      activity,
      // the mock can only vouch for itself
      health: { api: 'ok', database: 'ok', storage: 'ok' },
      policy: {
        idleLockMinutes: 15,
        trashRetentionDays: db.settings.retentionDays,
        linkMaxDays: db.settings.linkMaxDays,
        mfaRequired: db.settings.mfaRequired,
      },
      security: {
        mfaEnrolled: users.filter((u) => mfaOf(u.id).length > 0).length,
        pendingKeyExchanges: db.members
          .filter((m) => m.status === 'pending')
          .map((m) => ({
            displayName: userName(m.userId),
            vaultName: db.vaults.find((v) => v.id === m.vaultId)?.name ?? '',
            since: m.joinedAt,
          })),
        failedSignIns7d: db.audit.filter(
          (e) => e.action === 'auth.login_failed' && e.timestamp >= weekAgo,
        ).length,
        sharesExpiring14d: db.shares.filter(
          (s) => s.expiresAt && s.expiresAt <= in14 && s.expiresAt > new Date().toISOString(),
        ).length,
      },
    }
    return HttpResponse.json(body)
  }),

  http.get(`${API}/admin/users`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    if (!isAdmin(auth.user)) return onlyAdmins()
    const url = new URL(request.url)
    const q = (url.searchParams.get('search') ?? '').toLowerCase()
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
    const pageSize = Math.min(100, Number(url.searchParams.get('pageSize') ?? 50))
    const all = db.users
      .filter(
        (u) => !q || u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q),
      )
      .map((u): AdminUserDto => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        status: u.status,
        systemRole: u.systemRole,
        storageBytes: db.files
          .filter((f) => f.ownerId === u.id)
          .reduce((n, f) => n + fileBytes(f.id), 0),
        createdAt: u.createdAt,
        lastActiveAt: u.lastActiveAt,
        fingerprint: u.publicKey ? u.fingerprint : null,
        mfa: mfaOf(u.id),
      }))
    const body: Paged<AdminUserDto> = {
      items: all.slice((page - 1) * pageSize, page * pageSize),
      total: all.length,
      page,
      pageSize,
    }
    return HttpResponse.json(body)
  }),

  // suspend / reactivate, change the system role. suspending ends every session at once
  http.patch(`${API}/admin/users/:id`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    if (!isAdmin(auth.user)) return onlyAdmins()
    const u = db.users.find((x) => x.id === params.id)
    if (!u) return problem(404, 'NOT_FOUND', 'No such user.')
    if (u.id === auth.user.id) return invalid('id', "You can't change your own account here.")
    const body = (await request.json()) as { status?: UserStatus; systemRole?: SystemRole }
    if (body.status === 'disabled') {
      u.status = 'disabled'
      for (const f of new Set(
        db.refreshTokens.filter((r) => r.userId === u.id).map((r) => r.familyId),
      ))
        revokeFamily(f)
      await appendAudit(auth.user.id, 'session.revoke', 'user', u.id)
    } else if (body.status === 'active' && u.status === 'disabled') {
      u.status = 'active'
    }
    if (body.systemRole && ['user', 'admin', 'auditor'].includes(body.systemRole))
      u.systemRole = body.systemRole
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/audit`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const url = new URL(request.url)
    const scope = auditScope(auth.user, url.searchParams.get('vaultId'))
    if (!scope)
      return problem(
        403,
        'FORBIDDEN_ROLE',
        'Only owners and managers can read a vault’s audit log.',
      )
    const actorId = url.searchParams.get('actorId')
    const action = url.searchParams.get('action')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
    const pageSize = Math.min(2000, Number(url.searchParams.get('pageSize') ?? 50))
    const all = db.audit
      .filter(scope)
      .filter((e) => (!actorId || e.actorId === actorId) && (!action || e.action === action))
      .filter((e) => (!from || e.timestamp >= from) && (!to || e.timestamp <= to))
      .sort((a, b) => b.seq - a.seq)
      .map(toAuditDto)
    const body: Paged<AuditEntryDto> = {
      items: all.slice((page - 1) * pageSize, page * pageSize),
      total: all.length,
      page,
      pageSize,
    }
    return HttpResponse.json(body)
  }),

  http.post(`${API}/audit/export`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    if (auth.user.systemRole !== 'admin' && auth.user.systemRole !== 'auditor') {
      return problem(403, 'FORBIDDEN_ROLE', 'Only auditors and administrators can export the log.')
    }
    const stepUp = checkStepUp(request, auth.user.id, 'audit.export')
    if (stepUp) return stepUp
    const { from, to } = (await request.json()) as { from?: string; to?: string }
    const entries = db.audit
      .filter((e) => (!from || e.timestamp >= from) && (!to || e.timestamp <= to))
      .map(toAuditDto)
    await appendAudit(auth.user.id, 'audit.export', 'user', auth.user.id)
    save()
    // a real backend signs daily anchors; the mock has no signing key, so it says so
    const body: AuditExportDto = { entries, anchors: [], signature: null }
    return HttpResponse.json(body)
  }),
]
