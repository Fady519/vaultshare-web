import { delay, http, HttpResponse } from 'msw'
import type {
  CompleteGrantRequest,
  InvitationDto,
  InviteRequest,
  MemberDto,
  PendingGrantDto,
  VaultRole,
} from '@/api/types'
import { db, save, type MockInvitation, type MockMember } from '../db'
import { appendAudit } from '../audit'
import { randomToken } from '../hash'
import { sendMail } from '../mail'
import { canManage, committedVersions, roleOf, wrappedKeyFor } from '../fileHelpers'
import { API, authenticate, checkStepUp, invalid, isEmail, newId, now, problem } from './utils'

/*
  Members, invitations and the "pending grant": an invitee becomes a member
  with status pending, and stays locked out until an owner or manager's
  browser wraps the vault's data keys for their public key.
*/

const ROLES: VaultRole[] = ['manager', 'editor', 'viewer']

export function toMemberDto(m: MockMember): MemberDto {
  const u = db.users.find((x) => x.id === m.userId)!
  return {
    userId: u.id,
    email: u.email,
    displayName: u.displayName,
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt,
    publicKey: u.publicKey,
    keyVersion: u.keyVersion,
    fingerprint: u.fingerprint,
  }
}

function toInvitationDto(i: MockInvitation): InvitationDto {
  const by = db.users.find((u) => u.id === i.invitedBy)!
  return {
    id: i.id,
    email: i.email,
    role: i.role,
    vaultId: i.vaultId,
    vaultName: db.vaults.find((v) => v.id === i.vaultId)?.name ?? '',
    status: i.status,
    invitedBy: { id: by.id, displayName: by.displayName },
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
  }
}

// every committed version of every file in the vault (trash included: it can be restored)
const vaultVersions = (vaultId: string) =>
  db.files
    .filter((f) => f.vaultId === vaultId && f.state !== 'uploading')
    .flatMap((f) => committedVersions(f.id).map((v) => ({ fileId: f.id, versionId: v.id })))

function managerOf(vaultId: string, userId: string) {
  if (!roleOf(vaultId, userId)) return problem(404, 'NOT_FOUND', 'Vault not found.')
  if (!canManage(roleOf(vaultId, userId))) {
    return problem(403, 'FORBIDDEN_ROLE', 'Only owners and managers can manage members.')
  }
  return null
}

export const memberHandlers = [
  http.patch(`${API}/vaults/:vaultId/members/:userId`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const vaultId = String(params.vaultId)
    const denied = managerOf(vaultId, auth.user.id)
    if (denied) return denied
    const stepUp = checkStepUp(request, auth.user.id, 'member.role')
    if (stepUp) return stepUp

    const m = db.members.find((x) => x.vaultId === vaultId && x.userId === params.userId)
    if (!m) return problem(404, 'NOT_FOUND', 'Not a member.')
    const body = (await request.json()) as { role: VaultRole }
    if (!ROLES.includes(body.role)) return invalid('role', 'Manager, editor or viewer.')
    if (m.role === 'owner')
      return problem(403, 'FORBIDDEN_ROLE', "The owner's role can't be changed here.")
    if (m.role === 'manager' && roleOf(vaultId, auth.user.id) !== 'owner') {
      return problem(403, 'FORBIDDEN_ROLE', 'Only the owner can change a manager.')
    }
    m.role = body.role
    await appendAudit(auth.user.id, 'member.role', 'vault', vaultId)
    save()
    return HttpResponse.json(toMemberDto(m))
  }),

  // takes their wrapped keys for the whole vault; the versions come back for optional re-keying
  http.delete(`${API}/vaults/:vaultId/members/:userId`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const vaultId = String(params.vaultId)
    const denied = managerOf(vaultId, auth.user.id)
    if (denied) return denied
    const stepUp = checkStepUp(request, auth.user.id, 'member.revoke')
    if (stepUp) return stepUp

    const userId = String(params.userId)
    const m = db.members.find((x) => x.vaultId === vaultId && x.userId === userId)
    if (!m) return problem(404, 'NOT_FOUND', 'Not a member.')
    if (m.role === 'owner') return problem(403, 'FORBIDDEN_ROLE', 'The owner cannot be removed.')
    if (m.role === 'manager' && roleOf(vaultId, auth.user.id) !== 'owner') {
      return problem(403, 'FORBIDDEN_ROLE', 'Only the owner can remove a manager.')
    }

    // keys for files they also hold through a direct share stay
    const shared = new Set(db.shares.filter((s) => s.userId === userId).map((s) => s.fileId))
    const versions = vaultVersions(vaultId).filter((v) => !shared.has(v.fileId))
    const ids = new Set(versions.map((v) => v.versionId))
    const affected = versions.filter((v) =>
      db.wrappedKeys.some((w) => w.versionId === v.versionId && w.userId === userId),
    )
    db.wrappedKeys = db.wrappedKeys.filter((w) => !(w.userId === userId && ids.has(w.versionId)))
    db.members = db.members.filter((x) => x !== m)
    db.favorites = db.favorites.filter(
      (f) => f.userId !== userId || !versions.some((v) => v.fileId === f.fileId),
    )
    await appendAudit(auth.user.id, 'member.revoke', 'vault', vaultId)
    save()
    return HttpResponse.json({ affectedVersions: affected })
  }),

  http.post(`${API}/vaults/:vaultId/invitations`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const vaultId = String(params.vaultId)
    const denied = managerOf(vaultId, auth.user.id)
    if (denied) return denied
    const stepUp = checkStepUp(request, auth.user.id, 'member.invite')
    if (stepUp) return stepUp

    const body = (await request.json()) as InviteRequest
    const email = body.email?.trim().toLowerCase() ?? ''
    if (!isEmail(email)) return invalid('email', 'Enter an email address.')
    if (!ROLES.includes(body.role)) return invalid('role', 'Manager, editor or viewer.')
    if (body.role === 'manager' && roleOf(vaultId, auth.user.id) !== 'owner') {
      return invalid('role', 'Only the owner can invite managers.')
    }
    const existing = db.users.find((u) => u.email.toLowerCase() === email)
    if (existing && roleOf(vaultId, existing.id)) {
      return problem(409, 'ALREADY_MEMBER', `${existing.displayName} is already in this vault.`)
    }

    const vault = db.vaults.find((v) => v.id === vaultId)!
    const token = randomToken(16)
    const inv: MockInvitation = {
      id: newId(),
      token,
      email,
      vaultId,
      role: body.role,
      invitedBy: auth.user.id,
      status: 'pending',
      createdAt: now(),
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    }
    db.invitations.push(inv)

    // someone who already has keys is in right away as "pending", the grant then wraps for them
    if (existing && existing.status === 'active' && existing.publicKey) {
      inv.status = 'accepted'
      db.members.push({
        vaultId,
        userId: existing.id,
        role: body.role,
        status: 'pending',
        joinedAt: now(),
      })
      sendMail(
        email,
        `${auth.user.displayName} added you to ${vault.name}`,
        `You are now a ${body.role} of "${vault.name}". The files open for you as soon as their keys are wrapped to your public key.`,
        { link: `${new URL(request.url).origin}/vaults/${vaultId}` },
      )
    } else {
      sendMail(
        email,
        `${auth.user.displayName} invited you to ${vault.name}`,
        `${body.message ? `"${body.message}"\n\n` : ''}You were invited to "${vault.name}" as ${body.role}. The link works for 7 days.`,
        { link: `${new URL(request.url).origin}/invite/${token}` },
      )
    }
    await appendAudit(auth.user.id, 'invite.create', 'vault', vaultId)
    save()
    return HttpResponse.json(toInvitationDto(inv), { status: 201 })
  }),

  http.get(`${API}/vaults/:vaultId/invitations`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const vaultId = String(params.vaultId)
    if (!canManage(roleOf(vaultId, auth.user.id))) return HttpResponse.json([])
    const open = db.invitations.filter(
      (i) => i.vaultId === vaultId && i.status === 'pending' && i.expiresAt > now(),
    )
    return HttpResponse.json(open.map(toInvitationDto))
  }),

  http.delete(`${API}/invitations/:id`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const inv = db.invitations.find((i) => i.id === params.id)
    if (!inv) return new HttpResponse(null, { status: 204 })
    const denied = managerOf(inv.vaultId, auth.user.id)
    if (denied) return denied
    db.invitations = db.invitations.filter((i) => i !== inv)
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  // for owners and managers: pending members who now have a public key to wrap for
  http.get(`${API}/grants/pending`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const list: PendingGrantDto[] = []
    for (const m of db.members.filter((x) => x.status === 'pending')) {
      if (!canManage(roleOf(m.vaultId, auth.user.id))) continue
      const u = db.users.find((x) => x.id === m.userId)!
      if (!u.publicKey || u.status !== 'active') continue
      const inv = db.invitations.find(
        (i) => i.vaultId === m.vaultId && i.email.toLowerCase() === u.email.toLowerCase(),
      )
      const versions = vaultVersions(m.vaultId)
        .map((v) => ({ ...v, wrappedKey: wrappedKeyFor(v.versionId, auth.user.id) }))
        .filter((v) => v.wrappedKey !== null) as PendingGrantDto['versions']
      list.push({
        invitationId: inv?.id ?? `${m.vaultId}:${m.userId}`,
        vaultId: m.vaultId,
        vaultName: db.vaults.find((v) => v.id === m.vaultId)?.name ?? '',
        role: m.role,
        recipient: {
          userId: u.id,
          email: u.email,
          displayName: u.displayName,
          publicKey: u.publicKey,
          keyVersion: u.keyVersion,
          fingerprint: u.fingerprint,
        },
        versions,
      })
    }
    return HttpResponse.json(list)
  }),

  http.post(`${API}/grants/:invitationId/complete`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const id = String(params.invitationId)
    const inv = db.invitations.find((i) => i.id === id)
    const [vaultId, fallbackUser] = inv ? [inv.vaultId, null] : id.split(':')
    const user = inv
      ? db.users.find((u) => u.email.toLowerCase() === inv.email.toLowerCase())
      : db.users.find((u) => u.id === fallbackUser)
    const m = user && db.members.find((x) => x.vaultId === vaultId && x.userId === user.id)
    if (!user || !m) return problem(404, 'NOT_FOUND', 'Nothing to complete.')
    const denied = managerOf(vaultId, auth.user.id)
    if (denied) return denied

    const body = (await request.json()) as CompleteGrantRequest
    const needed = vaultVersions(vaultId)
    const given = (body.wrappedKeys ?? []).filter((k) => k.userId === user.id)
    if (needed.some((v) => !given.some((k) => k.versionId === v.versionId))) {
      return problem(
        422,
        'MISSING_WRAPPED_KEYS',
        'Every version in the vault needs a key for them.',
      )
    }
    const ids = new Set(needed.map((v) => v.versionId))
    db.wrappedKeys = db.wrappedKeys
      .filter((w) => !(w.userId === user.id && ids.has(w.versionId)))
      .concat(
        given
          .filter((k) => ids.has(k.versionId))
          .map((k) => ({
            versionId: k.versionId,
            userId: user.id,
            keyVersion: k.keyVersion,
            wrapped: k.wrapped,
          })),
      )
    m.status = 'active'
    await appendAudit(auth.user.id, 'member.add', 'vault', vaultId)
    save()
    return new HttpResponse(null, { status: 204 })
  }),
]
