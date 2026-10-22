import { HttpResponse } from 'msw'
import { db, save, type MockUser } from './db'
import { randomToken } from './hash'
import { toUserDto } from './handlers/me'
import { ACCESS_TTL_S, REFRESH_TTL_S, now } from './handlers/utils'

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

export function issueAccessToken(userId: string) {
  const token = randomToken()
  db.accessTokens = db.accessTokens.filter((t) => t.expiresAt > Date.now())
  db.accessTokens.push({ token, userId, expiresAt: Date.now() + ACCESS_TTL_S * 1000 })
  return token
}

// extra = fields merged into the body (e.g. mfaRequired: false on login).
// Set-Cookie only survives when it's passed straight to HttpResponse, so build it here
export function sessionResponse(
  user: MockUser,
  request: Request,
  opts: { remember?: boolean; familyId?: string; extra?: Record<string, unknown> } = {},
) {
  const refresh = randomToken(32)
  db.refreshTokens.push({
    token: refresh,
    userId: user.id,
    familyId: opts.familyId ?? crypto.randomUUID(),
    usedAt: null,
    createdAt: now(),
    expiresAt: Date.now() + REFRESH_TTL_S * 1000,
    userAgent: request.headers.get('User-Agent') ?? 'unknown',
    remember: opts.remember ?? false,
  })
  user.lastActiveAt = now()
  const accessToken = issueAccessToken(user.id)
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
  const accessToken = issueAccessToken(row.userId)
  const user = db.users.find((u) => u.id === row.userId)
  if (user) user.lastActiveAt = now()
  save()
  return { accessToken, refresh: refreshCookie(token, row.remember) }
}

export function revokeFamilyOf(token: string) {
  const row = db.refreshTokens.find((r) => r.token === token)
  if (!row) return
  db.refreshTokens = db.refreshTokens.filter((r) => r.familyId !== row.familyId)
  save()
}

export function revokeAllSessions(userId: string) {
  db.refreshTokens = db.refreshTokens.filter((r) => r.userId !== userId)
  db.accessTokens = db.accessTokens.filter((t) => t.userId !== userId)
  save()
}
