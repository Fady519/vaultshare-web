import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { UserDto, UserLookupDto } from './types'

export const meKeys = {
  me: ['me'] as const,
}

export function useMe() {
  return useQuery({
    queryKey: meKeys.me,
    queryFn: () => api.get<UserDto>('/me'),
  })
}

// 404 USER_NOT_FOUND means "no account yet", the caller turns that into an invitation
export const lookupUser = (email: string) =>
  api.get<UserLookupDto>(`/users/lookup?email=${encodeURIComponent(email.trim())}`)
