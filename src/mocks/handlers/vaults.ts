import { delay, http, HttpResponse } from 'msw'
import type { CreateVaultRequest, MemberDto, VaultDto, VaultRole } from '@/api/types'
import { db, save, type MockVault } from '../db'
import { API, currentUser, newId, now, problem, unauthorized } from './utils'

function roleOf(vaultId: string, userId: string) {
  return db.members.find((m) => m.vaultId === vaultId && m.userId === userId)?.role
}

function toVaultDto(v: MockVault, userId: string): VaultDto {
  return {
    id: v.id,
    name: v.name,
    description: v.description,
    ownerId: v.ownerId,
    role: roleOf(v.id, userId) ?? 'viewer',
    // files arrive in phase 3
    fileCount: 0,
    memberCount: db.members.filter((m) => m.vaultId === v.id).length,
    sizeBytes: 0,
    createdAt: v.createdAt,
  }
}

const canManage = (role?: VaultRole) => role === 'owner' || role === 'manager'

export const vaultHandlers = [
  http.get(`${API}/vaults`, async ({ request }) => {
    await delay()
    const user = currentUser(request)
    if (!user) return unauthorized()

    const mine = db.vaults.filter((v) => roleOf(v.id, user.id))
    return HttpResponse.json(mine.map((v) => toVaultDto(v, user.id)))
  }),

  http.post(`${API}/vaults`, async ({ request }) => {
    await delay()
    const user = currentUser(request)
    if (!user) return unauthorized()

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

    // people who already have an account join right away, the rest become invitations (phase 5)
    for (const m of body.members ?? []) {
      const invitee = db.users.find((u) => u.email.toLowerCase() === m.email.trim().toLowerCase())
      if (invitee && invitee.id !== user.id) {
        db.members.push({
          vaultId: vault.id,
          userId: invitee.id,
          role: m.role,
          status: 'active',
          joinedAt: now(),
        })
      }
    }

    save()
    return HttpResponse.json(toVaultDto(vault, user.id), { status: 201 })
  }),

  http.get(`${API}/vaults/:vaultId`, async ({ request, params }) => {
    await delay()
    const user = currentUser(request)
    if (!user) return unauthorized()

    const vault = db.vaults.find((v) => v.id === params.vaultId)
    if (!vault || !roleOf(vault.id, user.id)) return problem(404, 'NOT_FOUND', 'Vault not found.')
    return HttpResponse.json(toVaultDto(vault, user.id))
  }),

  http.patch(`${API}/vaults/:vaultId`, async ({ request, params }) => {
    await delay()
    const user = currentUser(request)
    if (!user) return unauthorized()

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
    const user = currentUser(request)
    if (!user) return unauthorized()
    if (!roleOf(String(params.vaultId), user.id))
      return problem(404, 'NOT_FOUND', 'Vault not found.')

    const members: MemberDto[] = db.members
      .filter((m) => m.vaultId === params.vaultId)
      .map((m) => {
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
      })
    return HttpResponse.json(members)
  }),
]
