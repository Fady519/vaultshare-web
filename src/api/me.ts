import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { UserDto } from './types'

export const meKeys = {
  me: ['me'] as const,
}

export function useMe() {
  return useQuery({
    queryKey: meKeys.me,
    queryFn: () => api.get<UserDto>('/me'),
  })
}
