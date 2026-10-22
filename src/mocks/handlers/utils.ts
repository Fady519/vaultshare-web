import { HttpResponse } from 'msw'
import type { ErrorCode, StepUpAction } from '@/api/types'
import { db, type MockUser } from '../db'
import { DEMO_USER_ID } from '../seed'

export const API = '/api/v1'

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

export function now() {
  return new Date().toISOString()
}

export function newId() {
  return crypto.randomUUID()
}

export function currentUser(request: Request): MockUser | null {
  const header = request.headers.get('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null

  if (token) {
    const row = db.accessTokens.find((t) => t.token === token)
    if (!row || row.expiresAt < Date.now()) return null
    return db.users.find((u) => u.id === row.userId) ?? null
  }

  // TODO(phase 2): remove. until sign-in exists, requests without a token
  // act as the demo user so the shell has data to show
  return db.users.find((u) => u.id === DEMO_USER_ID) ?? null
}

export function unauthorized() {
  return problem(401, 'UNAUTHENTICATED', 'Sign in to continue.')
}
