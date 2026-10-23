import { delay, http, HttpResponse } from 'msw'
import type {
  ChangePasswordRequest,
  KeyHistoryDto,
  RotateKeysRequest,
  SecurityOverviewDto,
  SessionDto,
} from '@/api/types'
import { db, save } from '../db'
import { appendAudit } from '../audit'
import { describeAgent } from '../agent'
import { hashVerifier } from '../hash'
import { notify } from '../notify'
import { familyOf, revokeFamily } from '../session'
import { purgeFile } from '../fileOps'
import { userName } from '../fileHelpers'
import { API, authenticate, checkStepUp, invalid, now, problem } from './utils'

/*
  The signed-in person's own account: password, idle lock, sessions, keys,
  and deleting it all. Everything that changes keys asks for a step-up.
*/

const IDLE_CHOICES = [5, 15, 30, 60]

async function fingerprintOf(publicKeyB64: string) {
  const bytes = Uint8Array.from(atob(publicKeyB64), (c) => c.charCodeAt(0))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).slice(0, 16)
  const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex.match(/.{4}/g)!.join(' ')
}

// a stable fake address per session, the mock has no real network to read
function fakeIp(familyId: string) {
  const n = [...familyId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  return `${41 + (n % 150)}.${(n >>> 8) % 255}.${(n >>> 16) % 255}.x`
}

function sessionsOf(userId: string, current: string | null): SessionDto[] {
  const families = new Map<string, typeof db.refreshTokens>()
  for (const r of db.refreshTokens.filter((x) => x.userId === userId && x.expiresAt > Date.now())) {
    families.set(r.familyId, [...(families.get(r.familyId) ?? []), r])
  }
  const firstSeen = (ua: string) =>
    db.refreshTokens
      .filter((r) => r.userId === userId && r.userAgent === ua)
      .map((r) => r.createdAt)
      .sort()[0]
  return [...families.entries()]
    .map(([familyId, rows]) => {
      const latest = rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      const d = describeAgent(latest.userAgent)
      return {
        id: familyId,
        device: `${d.os} · ${d.browser}`,
        browser: d.browser,
        os: d.os,
        ipMasked: fakeIp(familyId),
        location: 'unknown (mock server)',
        createdAt: rows[rows.length - 1].createdAt,
        firstSeenAt: firstSeen(latest.userAgent) ?? latest.createdAt,
        lastActiveAt: latest.createdAt,
        refreshExpiresAt: new Date(latest.expiresAt).toISOString(),
        trusted: latest.remember,
        current: familyId === current,
      }
    })
    .sort(
      (a, b) =>
        Number(b.current) - Number(a.current) || b.lastActiveAt.localeCompare(a.lastActiveAt),
    )
}

export const accountHandlers = [
  // the old password is proven with its verifier; the private key comes back re-sealed
  http.post(`${API}/me/password`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const u = auth.user
    const body = (await request.json()) as ChangePasswordRequest
    if (u.verifierHash !== (await hashVerifier(body.currentVerifier ?? ''))) {
      return problem(401, 'INVALID_CREDENTIALS', 'The current password is not right.')
    }
    if (!body.verifier || !body.sealedPrivateKey || !body.saltAuth || !body.saltWrap) {
      return invalid('verifier', 'Missing the new password material.')
    }
    u.saltAuth = body.saltAuth
    u.saltWrap = body.saltWrap
    u.verifierHash = await hashVerifier(body.verifier)
    u.sealedPrivateKey = body.sealedPrivateKey
    if (body.signOutOthers) {
      const keep = familyOf(request)
      for (const f of new Set(
        db.refreshTokens.filter((r) => r.userId === u.id).map((r) => r.familyId),
      )) {
        if (f !== keep) revokeFamily(f)
      }
    }
    await appendAudit(u.id, 'auth.password', 'user', u.id)
    notify(u.id, 'security.recovery', {
      title: 'Your password was changed',
      body: body.signOutOthers
        ? 'Every other session was signed out.'
        : 'Other sessions stay signed in.',
      link: '/settings/sessions',
    })
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.put(`${API}/security/idle-lock`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const { minutes } = (await request.json()) as { minutes: number }
    if (!IDLE_CHOICES.includes(minutes)) return invalid('minutes', '5, 15, 30 or 60 minutes.')
    auth.user.idleLockMinutes = minutes
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/security/overview`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const u = auth.user
    const body: SecurityOverviewDto = {
      factors: db.factors
        .filter((f) => f.userId === u.id && f.confirmed)
        .map((f) => ({
          id: f.id,
          type: f.type,
          label: f.label,
          createdAt: f.createdAt,
          lastUsedAt: f.lastUsedAt,
        })),
      activeSessions: sessionsOf(u.id, null).length,
      idleLockMinutes: u.idleLockMinutes,
      recoveryCodesLeft: db.recoveryCodes.filter((c) => c.userId === u.id && !c.usedAt).length,
      keyVersion: u.keyVersion,
      recentEvents: db.audit
        .filter((e) => e.actorId === u.id && /^(auth|mfa|keys|session)\./.test(e.action))
        .slice(-6)
        .reverse()
        .map((e) => ({ ...e, actorName: userName(u.id) })),
    }
    return HttpResponse.json(body)
  }),

  http.get(`${API}/sessions`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    return HttpResponse.json(sessionsOf(auth.user.id, familyOf(request)))
  }),

  http.delete(`${API}/sessions/:id`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const id = String(params.id)
    if (id === familyOf(request)) {
      return problem(409, 'CURRENT_SESSION', 'Use "Sign out" for the session you are in.')
    }
    if (!db.refreshTokens.some((r) => r.familyId === id && r.userId === auth.user.id)) {
      return problem(404, 'NOT_FOUND', 'No such session.')
    }
    revokeFamily(id)
    await appendAudit(auth.user.id, 'session.revoke', 'session', id)
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  // "sign out everywhere else"
  http.delete(`${API}/sessions`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const keep = familyOf(request)
    const others = new Set(
      db.refreshTokens
        .filter((r) => r.userId === auth.user.id && r.familyId !== keep)
        .map((r) => r.familyId),
    )
    for (const f of others) {
      revokeFamily(f)
      await appendAudit(auth.user.id, 'session.revoke', 'session', f)
    }
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/keys/history`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const u = auth.user
    const rows: KeyHistoryDto[] = db.keyHistory
      .filter((k) => k.userId === u.id)
      .sort((a, b) => b.keyVersion - a.keyVersion)
      .map((k) => ({
        keyVersion: k.keyVersion,
        fingerprint: k.fingerprint,
        algorithm: k.algorithm,
        createdAt: k.createdAt,
        retiredAt: k.retiredAt,
        wrappedCount: db.wrappedKeys.filter(
          (w) => w.userId === u.id && w.keyVersion === k.keyVersion,
        ).length,
        state: k.state,
      }))
    return HttpResponse.json(rows)
  }),

  // every data key wrapped to me, so the browser can re-wrap them for a new key pair
  http.get(`${API}/keys/me/wrapped`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    return HttpResponse.json(
      db.wrappedKeys
        .filter((w) => w.userId === auth.user.id)
        .map((w) => ({ versionId: w.versionId, keyVersion: w.keyVersion, wrapped: w.wrapped })),
    )
  }),

  http.post(`${API}/keys/rotate`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const stepUp = checkStepUp(request, auth.user.id, 'keys.rotate')
    if (stepUp) return stepUp
    const u = auth.user
    const body = (await request.json()) as RotateKeysRequest
    if (body.keyVersion !== u.keyVersion + 1)
      return invalid('keyVersion', `Expected key version ${u.keyVersion + 1}.`)
    const mine = db.wrappedKeys.filter((w) => w.userId === u.id)
    const given = new Map((body.rewrapped ?? []).map((r) => [r.versionId, r.wrapped]))
    if (mine.some((w) => !given.has(w.versionId))) {
      return problem(422, 'MISSING_WRAPPED_KEYS', 'Every data key you hold has to be re-wrapped.')
    }

    for (const w of mine) {
      w.wrapped = given.get(w.versionId)!
      w.keyVersion = body.keyVersion
    }
    const old = db.keyHistory.find((k) => k.userId === u.id && k.state === 'active')
    if (old) {
      old.state = 'retired'
      old.retiredAt = now()
    }
    u.publicKey = body.publicKey
    u.sealedPrivateKey = body.sealedPrivateKey
    u.sealedRecoveryKey = body.sealedRecoveryKey
    u.keyVersion = body.keyVersion
    u.fingerprint = await fingerprintOf(body.publicKey)
    u.keysCreatedAt = now()
    db.keyHistory.push({
      userId: u.id,
      keyVersion: u.keyVersion,
      fingerprint: u.fingerprint,
      algorithm: 'RSA-4096-OAEP',
      createdAt: now(),
      retiredAt: null,
      state: 'active',
    })
    await appendAudit(u.id, 'keys.rotate', 'user', u.id)
    notify(u.id, 'security.key_rotated', {
      title: 'Your key pair was rotated',
      body: `${mine.length} data keys re-wrapped · new fingerprint ${u.fingerprint.slice(0, 9)}`,
      link: '/settings/keys',
    })
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${API}/keys/recovery-kit`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const stepUp = checkStepUp(request, auth.user.id, 'keys.recovery')
    if (stepUp) return stepUp
    const { sealedRecoveryKey } = (await request.json()) as { sealedRecoveryKey: string }
    if (!sealedRecoveryKey) return invalid('sealedRecoveryKey', 'Missing.')
    auth.user.sealedRecoveryKey = sealedRecoveryKey
    await appendAudit(auth.user.id, 'keys.recovery', 'user', auth.user.id)
    notify(auth.user.id, 'security.recovery', {
      title: 'A new recovery kit was made',
      body: 'The old twelve words no longer open your key.',
      link: '/settings/keys',
    })
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  /*
    Lost key: a brand new pair, nothing re-wrapped. Every data key wrapped to
    the old key is deleted, memberships go back to "pending" so owners and
    managers can wrap the vault keys again; direct shares are lost.
  */
  http.post(`${API}/keys/reset`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const stepUp = checkStepUp(request, auth.user.id, 'keys.rotate')
    if (stepUp) return stepUp
    const u = auth.user
    const body = (await request.json()) as Omit<RotateKeysRequest, 'rewrapped'>
    db.wrappedKeys = db.wrappedKeys.filter((w) => w.userId !== u.id)
    db.shares = db.shares.filter((s) => s.userId !== u.id)
    for (const m of db.members.filter((x) => x.userId === u.id && x.role !== 'owner'))
      m.status = 'pending'
    const old = db.keyHistory.find((k) => k.userId === u.id && k.state === 'active')
    if (old) {
      old.state = 'revoked'
      old.retiredAt = now()
    }
    u.publicKey = body.publicKey
    u.sealedPrivateKey = body.sealedPrivateKey
    u.sealedRecoveryKey = body.sealedRecoveryKey
    u.keyVersion = u.keyVersion + 1
    u.fingerprint = await fingerprintOf(body.publicKey)
    u.keysCreatedAt = now()
    db.keyHistory.push({
      userId: u.id,
      keyVersion: u.keyVersion,
      fingerprint: u.fingerprint,
      algorithm: 'RSA-4096-OAEP',
      createdAt: now(),
      retiredAt: null,
      state: 'active',
    })
    await appendAudit(u.id, 'keys.rotate', 'user', u.id)
    notify(u.id, 'security.recovery', {
      title: 'Your private key was reset',
      body: 'Files wrapped only to the old key are gone for you until someone re-shares them.',
      link: '/settings/keys',
    })
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete(`${API}/me`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const stepUp = checkStepUp(request, auth.user.id, 'account.delete')
    if (stepUp) return stepUp
    const u = auth.user
    const { confirmEmail } = (await request.json()) as { confirmEmail: string }
    if (confirmEmail?.trim().toLowerCase() !== u.email.toLowerCase()) {
      return invalid('confirmEmail', 'Type your email address exactly.')
    }
    const owned = db.vaults.filter((v) =>
      db.members.some((m) => m.vaultId === v.id && m.userId === u.id && m.role === 'owner'),
    )
    const shared = owned.filter((v) =>
      db.members.some((m) => m.vaultId === v.id && m.userId !== u.id),
    )
    if (shared.length) {
      return problem(
        409,
        'OWNS_SHARED_VAULTS',
        `You own vaults other people use (${shared.map((v) => v.name).join(', ')}). Hand them over or remove the others first.`,
      )
    }
    // vaults only I was in go completely
    for (const v of owned) {
      for (const f of db.files.filter((x) => x.vaultId === v.id)) {
        f.state = 'trashed'
        await purgeFile(f, null)
      }
      db.members = db.members.filter((m) => m.vaultId !== v.id)
      db.vaults = db.vaults.filter((x) => x !== v)
    }
    db.wrappedKeys = db.wrappedKeys.filter((w) => w.userId !== u.id)
    db.members = db.members.filter((m) => m.userId !== u.id)
    db.shares = db.shares.filter((s) => s.userId !== u.id && s.sharedBy !== u.id)
    db.factors = db.factors.filter((f) => f.userId !== u.id)
    db.recoveryCodes = db.recoveryCodes.filter((c) => c.userId !== u.id)
    db.notifications = db.notifications.filter((n) => n.userId !== u.id)
    for (const f of new Set(
      db.refreshTokens.filter((r) => r.userId === u.id).map((r) => r.familyId),
    ))
      revokeFamily(f)
    db.users = db.users.filter((x) => x !== u)
    // the audit chain keeps the history; the actor id just stops resolving to a name
    await appendAudit(u.id, 'account.delete', 'user', u.id)
    save()
    return new HttpResponse(null, { status: 204 })
  }),
]
