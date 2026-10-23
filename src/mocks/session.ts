import { HttpResponse } from 'msw'
import { db, save, type MockUser } from './db'
import { randomToken } from './hash'
import { toUserDto } from './handlers/me'
import { ACCESS_TTL_S, REFRESH_TTL_S, now } from './handlers/utils'
import { describeAgent } from './agent'
import { notify } from './notify'

/*
  Session issuing like FR-07: a 10 minute access token in the body, and a
  14 day refresh token in a cookie that rotates on every use.
  (A real server sets HttpOnly; a mock running in the page can't, that's the
  one difference.)
*/

function refreshCookie(token: string, remember: boolean) {
  const maxAge = remember ? `; Max-Age=${REFRESH_TTL_S}` : ''
  return `vs_refresh=${token}; Path=/; SameSite=Strict${maxAge}`
}

export const clearRefreshCookie = 'vs_refresh=; Path=/; Max-Age=0'

export function issueAccessToken(userId: string, familyId: string | null = null) {
  const token = randomToken()
  db.accessTokens = db.accessTokens.filter((t) => t.expiresAt > Date.now())
  db.accessTokens.push({ token, userId, familyId, expiresAt: Date.now() + ACCESS_TTL_S * 1000 })
  return token
}

// the session (refresh family) a request comes from
export function familyOf(request: Request) {
  const header = request.headers.get('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  return db.accessTokens.find((t) => t.token === token)?.familyId ?? null
}

// a revoked session dies now, not when its access token runs out
export function revokeFamily(familyId: string) {
  db.refreshTokens = db.refreshTokens.filter((r) => r.familyId !== familyId)
  db.accessTokens = db.accessTokens.filter((t) => t.familyId !== familyId)
}

// extra = fields merged into the body (e.g. mfaRequired: false on login).
// Set-Cookie only survives when it's passed straight to HttpResponse, so build it here
export function sessionResponse(
  user: MockUser,
  request: Request,
  opts: { remember?: boolean; familyId?: string; extra?: Record<string, unknown> } = {},
) {
  const refresh = randomToken(32)
  const familyId = opts.familyId ?? crypto.randomUUID()
  const userAgent = request.headers.get('User-Agent') ?? 'unknown'
  // a browser this account hasn't used before
  const newDevice = !db.refreshTokens.some((r) => r.userId === user.id && r.userAgent === userAgent)
  db.refreshTokens.push({
    token: refresh,
    userId: user.id,
    familyId,
    usedAt: null,
    createdAt: now(),
    expiresAt: Date.now() + REFRESH_TTL_S * 1000,
    userAgent,
    remember: opts.remember ?? false,
  })
  user.lastActiveAt = now()
  const accessToken = issueAccessToken(user.id, familyId)
  if (newDevice && user.status === 'active') {
    const d = describeAgent(userAgent)
    notify(user.id, 'security.new_sign_in', {
      title: `New sign-in: ${d.browser} on ${d.os}`,
      body: 'If this was not you, revoke the session and change your password.',
      link: '/settings/sessions',
    })
  }
  save()

  return HttpResponse.json(
    { ...opts.extra, accessToken, expiresIn: ACCESS_TTL_S, user: toUserDto(user) },
    { headers: { 'Set-Cookie': refreshCookie(refresh, opts.remember ?? false) } },
  )
}

export function rotateRefresh(oldToken: string, request: Request) {
  const row = db.refreshTokens.find((r) => r.token === oldToken)
  if (!row || row.expiresAt < Date.now()) return { error: 'UNAUTHENTICATED' as const }

  // a used token showing up again = it was stolen. kill the whole family
  if (row.usedAt) {
    db.refreshTokens = db.refreshTokens.filter((r) => r.familyId !== row.familyId)
    save()
    return { error: 'REFRESH_REUSED' as const }
  }

  row.usedAt = now()
  const token = randomToken(32)
  db.refreshTokens.push({
    ...row,
    token,
    usedAt: null,
    createdAt: now(),
    userAgent: request.headers.get('User-Agent') ?? row.userAgent,
  })
  const accessToken = issueAccessToken(row.userId, row.familyId)
  const user = db.users.find((u) => u.id === row.userId)
  if (user) user.lastActiveAt = now()
  save()
  return { accessToken, refresh: refreshCookie(token, row.remember) }
}

export function revokeFamilyOf(token: string) {
  const row = db.refreshTokens.find((r) => r.token === token)
  if (!row) return
  revokeFamily(row.familyId)
  save()
}

export function revokeAllSessions(userId: string) {
  db.refreshTokens = db.refreshTokens.filter((r) => r.userId !== userId)
  db.accessTokens = db.accessTokens.filter((t) => t.userId !== userId)
  save()
}
