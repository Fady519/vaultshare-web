import { HttpResponse } from 'msw'
import type { ErrorCode, StepUpAction } from '@/api/types'
import { db, type MockUser } from '../db'

export const API = '/api/v1'

export const ACCESS_TTL_S = 10 * 60
export const REFRESH_TTL_S = 14 * 24 * 60 * 60

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  410: 'Gone',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
}

// same ProblemDetails shape ASP.NET returns (RFC 7807) + our "code"
export function problem(
  status: number,
  code: ErrorCode,
  detail?: string,
  extra?: { errors?: Record<string, string[]>; action?: StepUpAction },
) {
  return HttpResponse.json(
    { type: 'about:blank', title: TITLES[status] ?? 'Error', status, detail, code, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

export function invalid(field: string, message: string) {
  return problem(400, 'VALIDATION_FAILED', 'Check the highlighted fields.', {
    errors: { [field]: [message] },
  })
}

export function now() {
  return new Date().toISOString()
}

export function newId() {
  return crypto.randomUUID()
}

export const isEmail = (v: unknown) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

export const findUserByEmail = (email: string) =>
  db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())

type AuthResult = { user: MockUser; error?: never } | { user?: never; error: Response }

/*
  Reads "Authorization: Bearer <token>".
  - no / unknown token -> 401 UNAUTHENTICATED
  - expired token      -> 401 TOKEN_EXPIRED (the client refreshes and retries)
  - onboarding not finished -> 403, unless the endpoint is part of onboarding
*/
export function authenticate(request: Request, opts: { onboarding?: boolean } = {}): AuthResult {
  const header = request.headers.get('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  const row = token ? db.accessTokens.find((t) => t.token === token) : undefined

  if (!row) return { error: problem(401, 'UNAUTHENTICATED', 'Sign in to continue.') }
  if (row.expiresAt < Date.now()) {
    return { error: problem(401, 'TOKEN_EXPIRED', 'Your session token expired.') }
  }

  const user = db.users.find((u) => u.id === row.userId)
  if (!user || user.status === 'disabled') {
    return { error: problem(401, 'UNAUTHENTICATED', 'Sign in to continue.') }
  }
  if (user.status !== 'active' && !opts.onboarding) {
    return { error: problem(403, 'FORBIDDEN_ROLE', 'Finish setting up your account first.') }
  }
  return { user }
}

// step-up token for one action, valid 5 minutes (FR-17)
export function checkStepUp(request: Request, userId: string, action: StepUpAction) {
  const token = request.headers.get('X-Step-Up-Token')
  const row = token ? db.stepUps.find((s) => s.token === token) : undefined
  if (!row || row.userId !== userId || row.action !== action || row.expiresAt < Date.now()) {
    return problem(403, 'STEP_UP_REQUIRED', 'Confirm it is you to continue.', { action })
  }
  return null
}
