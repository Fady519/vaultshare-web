import { delay, http, HttpResponse } from 'msw'
import type { CreateVaultRequest, MemberDto, VaultDto, VaultRole } from '@/api/types'
import { db, save, type MockVault } from '../db'
import { sendMail } from '../mail'
import { roleOf, vaultStats } from '../fileHelpers'
import { API, authenticate, newId, now, problem } from './utils'
import { toMemberDto } from './members'

function toVaultDto(v: MockVault, userId: string): VaultDto {
  return {
    id: v.id,
    name: v.name,
    description: v.description,
    ownerId: v.ownerId,
    role: roleOf(v.id, userId) ?? 'viewer',
    myStatus: db.members.find((m) => m.vaultId === v.id && m.userId === userId)?.status ?? 'active',
    ...vaultStats(v.id),
    memberCount: db.members.filter((m) => m.vaultId === v.id).length,
    createdAt: v.createdAt,
  }
}

const canManage = (role?: VaultRole) => role === 'owner' || role === 'manager'

export const vaultHandlers = [
  http.get(`${API}/vaults`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const user = auth.user

    const mine = db.vaults.filter((v) => roleOf(v.id, user.id))
    return HttpResponse.json(mine.map((v) => toVaultDto(v, user.id)))
  }),

  http.post(`${API}/vaults`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const user = auth.user

    const body = (await request.json()) as CreateVaultRequest
    const name = body.name?.trim() ?? ''
    if (name.length < 1 || name.length > 200) {
      return problem(400, 'VALIDATION_FAILED', 'Check the highlighted fields.', {
        errors: { name: ['Give the vault a name (up to 200 characters).'] },
      })
    }

    const vault: MockVault = {
      id: newId(),
      name,
      description: body.description?.trim() ?? '',
      ownerId: user.id,
      createdAt: now(),
    }
    db.vaults.push(vault)
    db.members.push({
      vaultId: vault.id,
      userId: user.id,
      role: 'owner',
      status: 'active',
      joinedAt: now(),
    })

    // people who already have an account join right away, the rest get an invitation email
    const origin = new URL(request.url).origin
    for (const m of body.members ?? []) {
      const email = m.email.trim().toLowerCase()
      const invitee = db.users.find((u) => u.email.toLowerCase() === email)
      if (invitee?.id === user.id) continue
      if (invitee) {
        db.members.push({
          vaultId: vault.id,
          userId: invitee.id,
          role: m.role,
          status: 'active',
          joinedAt: now(),
        })
      } else {
        const token = crypto.randomUUID().replace(/-/g, '')
        db.invitations.push({
          id: newId(),
          token,
          email,
          vaultId: vault.id,
          role: m.role,
          invitedBy: user.id,
          status: 'pending',
          createdAt: now(),
          expiresAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
        })
        sendMail(
          email,
          `${user.displayName} invited you to ${vault.name}`,
          `You were invited to the vault "${vault.name}" as ${m.role}. Create an account to join.`,
          { link: `${origin}/invite/${token}` },
        )
      }
    }

    save()
    return HttpResponse.json(toVaultDto(vault, user.id), { status: 201 })
  }),

  http.get(`${API}/vaults/:vaultId`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const user = auth.user

    const vault = db.vaults.find((v) => v.id === params.vaultId)
    if (!vault || !roleOf(vault.id, user.id)) return problem(404, 'NOT_FOUND', 'Vault not found.')
    return HttpResponse.json(toVaultDto(vault, user.id))
  }),

  http.patch(`${API}/vaults/:vaultId`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const user = auth.user

    const vault = db.vaults.find((v) => v.id === params.vaultId)
    if (!vault) return problem(404, 'NOT_FOUND', 'Vault not found.')
    if (!canManage(roleOf(vault.id, user.id))) {
      return problem(403, 'FORBIDDEN_ROLE', 'Only owners and managers can rename a vault.')
    }

    const body = (await request.json()) as { name?: string; description?: string }
    if (body.name !== undefined) vault.name = body.name.trim() || vault.name
    if (body.description !== undefined) vault.description = body.description.trim()
    save()
    return HttpResponse.json(toVaultDto(vault, user.id))
  }),

  http.get(`${API}/vaults/:vaultId/members`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const user = auth.user
    if (!roleOf(String(params.vaultId), user.id))
      return problem(404, 'NOT_FOUND', 'Vault not found.')

    const members: MemberDto[] = db.members
      .filter((m) => m.vaultId === params.vaultId)
      .map(toMemberDto)
    return HttpResponse.json(members)
  }),
]
