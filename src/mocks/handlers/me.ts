import { delay, http, HttpResponse } from 'msw'
import type { UserDto } from '@/api/types'
import { save, type MockUser } from '../db'
import { API, currentUser, problem, unauthorized } from './utils'

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
    mfaEnabled: u.mfaEnabled,
    createdAt: u.createdAt,
  }
}

export const meHandlers = [
  http.get(`${API}/me`, async ({ request }) => {
    await delay()
    const user = currentUser(request)
    if (!user) return unauthorized()
    return HttpResponse.json(toUserDto(user))
  }),

  http.patch(`${API}/me`, async ({ request }) => {
    await delay()
    const user = currentUser(request)
    if (!user) return unauthorized()

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
]
