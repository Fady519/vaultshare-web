import { delay, http, HttpResponse } from 'msw'
import type { InvitationPreviewDto } from '@/api/types'
import { db, save } from '../db'
import { appendAudit } from '../audit'
import { API, authenticate, now, problem } from './utils'

function findOpen(token: string) {
  const inv = db.invitations.find((i) => i.token === token)
  if (!inv || inv.status !== 'pending' || new Date(inv.expiresAt).getTime() < Date.now())
    return null
  return inv
}

export const invitationHandlers = [
  // public: the invite link works before the person has an account
  http.get(`${API}/invitations/by-token/:token`, async ({ params }) => {
    await delay()
    const inv = findOpen(String(params.token))
    if (!inv) return problem(410, 'LINK_GONE', 'This invitation is no longer valid.')

    const vault = db.vaults.find((v) => v.id === inv.vaultId)!
    const inviter = db.users.find((u) => u.id === inv.invitedBy)!
    const body: InvitationPreviewDto = {
      email: inv.email,
      role: inv.role,
      vaultName: vault.name,
      inviterName: inviter.displayName,
      inviterEmail: inviter.email,
      expiresAt: inv.expiresAt,
      fileCount: 0,
      memberCount: db.members.filter((m) => m.vaultId === vault.id).length,
    }
    return HttpResponse.json(body)
  }),

  http.post(`${API}/invitations/by-token/:token/accept`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request, { onboarding: true })
    if (auth.error) return auth.error
    if (!auth.user.publicKey) {
      return problem(409, 'ALREADY_MEMBER', 'Finish the key ceremony before accepting.')
    }

    const inv = findOpen(String(params.token))
    if (!inv) return problem(410, 'LINK_GONE', 'This invitation is no longer valid.')

    const already = db.members.some((m) => m.vaultId === inv.vaultId && m.userId === auth.user.id)
    if (!already) {
      // "pending" until the inviter's browser wraps the vault's keys for us (phase 5)
      db.members.push({
        vaultId: inv.vaultId,
        userId: auth.user.id,
        role: inv.role,
        status: 'pending',
        joinedAt: now(),
      })
    }
    inv.status = 'accepted'
    await appendAudit(auth.user.id, 'invite.accept', 'vault', inv.vaultId)
    save()
    return new HttpResponse(null, { status: 204 })
  }),
]
