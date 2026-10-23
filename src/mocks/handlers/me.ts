import { delay, http, HttpResponse } from 'msw'
import type { UserDto, UserLookupDto } from '@/api/types'
import { db, save, type MockUser } from '../db'
import { API, authenticate, problem } from './utils'

export function toUserDto(u: MockUser): UserDto {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    locale: u.locale,
    status: u.status,
    systemRole: u.systemRole,
    keyVersion: u.keyVersion,
    mfaEnabled: db.factors.some((f) => f.userId === u.id && f.confirmed),
    createdAt: u.createdAt,
  }
}

export const meHandlers = [
  http.get(`${API}/me`, async ({ request }) => {
    await delay()
    const auth = authenticate(request, { onboarding: true })
    if (auth.error) return auth.error
    return HttpResponse.json(toUserDto(auth.user))
  }),

  http.patch(`${API}/me`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const user = auth.user

    const body = (await request.json()) as { displayName?: string; locale?: string }
    if (body.displayName !== undefined) {
      const name = body.displayName.trim()
      if (name.length < 2 || name.length > 80) {
        return problem(400, 'VALIDATION_FAILED', 'Check the highlighted fields.', {
          errors: { displayName: ['Use between 2 and 80 characters.'] },
        })
      }
      user.displayName = name
    }
    if (body.locale) user.locale = body.locale
    save()
    return HttpResponse.json(toUserDto(user))
  }),

  // exact email only, so it can't be used to list who has an account
  http.get(`${API}/users/lookup`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error

    const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase() ?? ''
    const u = db.users.find((x) => x.email.toLowerCase() === email && x.status === 'active')
    if (!u || !u.publicKey)
      return problem(404, 'USER_NOT_FOUND', 'No VaultShare account uses this email.')

    const found: UserLookupDto = {
      userId: u.id,
      email: u.email,
      displayName: u.displayName,
      publicKey: u.publicKey,
      keyVersion: u.keyVersion,
      fingerprint: u.fingerprint,
    }
    return HttpResponse.json(found)
  }),
]
