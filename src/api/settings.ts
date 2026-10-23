import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type {
  ChangePasswordRequest,
  KeyHistoryDto,
  MfaFactorDto,
  MyKeysDto,
  NotificationDto,
  NotificationSettingDto,
  RotateKeysRequest,
  SecurityOverviewDto,
  SessionDto,
  TotpSetupResponse,
} from './types'

export const settingsKeys = {
  security: ['security'] as const,
  sessions: ['sessions'] as const,
  keys: ['keys', 'me'] as const,
  keyHistory: ['keys', 'history'] as const,
  notifications: ['notifications'] as const,
  notificationSettings: ['notification-settings'] as const,
}

export const settingsApi = {
  changePassword: (body: ChangePasswordRequest) => api.post<void>('/me/password', body),
  setIdleLock: (minutes: number) => api.put<void>('/security/idle-lock', { minutes }),
  deleteAccount: (confirmEmail: string) => api.del<void>('/me', { body: { confirmEmail } }),
  security: () => api.get<SecurityOverviewDto>('/security/overview'),

  sessions: () => api.get<SessionDto[]>('/sessions'),
  revokeSession: (id: string) => api.del<void>(`/sessions/${id}`),
  revokeOtherSessions: () => api.del<void>('/sessions'),

  // second factors after onboarding
  factors: () => api.get<MfaFactorDto[]>('/mfa/factors'),
  removeFactor: (id: string) => api.del<void>(`/mfa/factors/${id}`),
  totpSetup: () => api.post<TotpSetupResponse>('/mfa/totp/setup'),
  totpConfirm: (code: string, label: string) =>
    api.post<{ factorId: string }>('/mfa/totp/confirm', { code, label }),
  newRecoveryCodes: () => api.post<{ codes: string[] }>('/mfa/recovery-codes'),

  myKeys: () => api.get<MyKeysDto>('/keys/me'),
  keyHistory: () => api.get<KeyHistoryDto[]>('/keys/history'),
  myWrappedKeys: () =>
    api.get<{ versionId: string; keyVersion: number; wrapped: string }[]>('/keys/me/wrapped'),
  rotateKeys: (body: RotateKeysRequest) => api.post<void>('/keys/rotate', body),
  resetKeys: (body: Omit<RotateKeysRequest, 'rewrapped'>) => api.post<void>('/keys/reset', body),
  newRecoveryKit: (sealedRecoveryKey: string) =>
    api.post<void>('/keys/recovery-kit', { sealedRecoveryKey }),

  notifications: () => api.get<NotificationDto[]>('/notifications'),
  markRead: (id: string) => api.post<void>(`/notifications/${id}/read`),
  markAllRead: () => api.post<void>('/notifications/read-all'),
  notificationSettings: () => api.get<NotificationSettingDto[]>('/notification-settings'),
  setNotification: (key: string, enabled: boolean) =>
    api.put<void>('/notification-settings', { key, enabled }),
}

export function useSecurityOverview() {
  return useQuery({ queryKey: settingsKeys.security, queryFn: settingsApi.security })
}

export function useSessions() {
  return useQuery({ queryKey: settingsKeys.sessions, queryFn: settingsApi.sessions })
}

export function useMyKeys() {
  return useQuery({ queryKey: settingsKeys.keys, queryFn: settingsApi.myKeys })
}

export function useKeyHistory() {
  return useQuery({ queryKey: settingsKeys.keyHistory, queryFn: settingsApi.keyHistory })
}

// the bell polls too, so a share shows up without a reload
export function useNotifications() {
  return useQuery({
    queryKey: settingsKeys.notifications,
    queryFn: settingsApi.notifications,
    refetchInterval: 30_000,
  })
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: settingsKeys.notificationSettings,
    queryFn: settingsApi.notificationSettings,
  })
}
