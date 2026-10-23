import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type {
  InvitationPreviewDto,
  KeySetupRequest,
  LoginMfaRequest,
  LoginRequest,
  LoginResponse,
  MfaFactorDto,
  MyKeysDto,
  PreloginResponse,
  RecoveryCompleteRequest,
  RecoveryMode,
  RecoveryVerifyResponse,
  RegisterRequest,
  SessionResponse,
  StepUpRequest,
  StepUpResponse,
  TotpSetupResponse,
  VerifyEmailRequest,
} from './types'

// auth calls are steps in a flow, not cached data, so most of them are plain functions

export const authApi = {
  prelogin: (email: string) => api.post<PreloginResponse>('/auth/prelogin', { email }),
  register: (body: RegisterRequest) => api.post<void>('/auth/register', body),
  verifyEmail: (body: VerifyEmailRequest) => api.post<SessionResponse>('/auth/verify-email', body),
  resendVerification: (email: string) => api.post<void>('/auth/resend-verification', { email }),
  login: (body: LoginRequest) => api.post<LoginResponse>('/auth/login', body),
  loginMfa: (body: LoginMfaRequest) => api.post<SessionResponse>('/auth/login/mfa', body),
  loginWebauthnOptions: (mfaToken: string) =>
    api.post<{ options: unknown }>('/auth/login/webauthn/options', { mfaToken }),
  loginWebauthn: (mfaToken: string, assertion: unknown, rememberDevice: boolean) =>
    api.post<SessionResponse>('/auth/login/webauthn', { mfaToken, assertion, rememberDevice }),
  logout: () => api.post<void>('/auth/logout'),

  recoveryStart: (email: string, mode: RecoveryMode) =>
    api.post<void>('/auth/recovery/start', { email, mode }),
  recoveryVerify: (token: string) =>
    api.post<RecoveryVerifyResponse>('/auth/recovery/verify', { token }),
  recoveryComplete: (body: RecoveryCompleteRequest) =>
    api.post<void>('/auth/recovery/complete', body),

  // FR-17: a short-lived token for one sensitive action, sent back as X-Step-Up-Token
  stepUp: (body: StepUpRequest) => api.post<StepUpResponse>('/auth/step-up', body),
}

export const keysApi = {
  setup: (body: KeySetupRequest) => api.post<void>('/keys/setup', body),
  mine: () => api.get<MyKeysDto>('/keys/me'),
}

export const mfaApi = {
  totpSetup: () => api.post<TotpSetupResponse>('/mfa/totp/setup'),
  totpConfirm: (code: string, label?: string) =>
    api.post<{ factorId: string }>('/mfa/totp/confirm', { code, label }),
  webauthnOptions: () => api.post<{ options: unknown }>('/mfa/webauthn/options'),
  webauthnRegister: (name: string, attestation: unknown) =>
    api.post<{ factorId: string }>('/mfa/webauthn/register', { name, attestation }),
  recoveryCodes: () => api.post<{ codes: string[] }>('/mfa/recovery-codes'),
  confirmRecoveryCode: (code: string) => api.post<void>('/mfa/recovery-codes/confirm', { code }),
  factors: () => api.get<MfaFactorDto[]>('/mfa/factors'),
}

export const invitationApi = {
  accept: (token: string) => api.post<void>(`/invitations/by-token/${token}/accept`),
}

export function useInvitation(token: string | undefined) {
  return useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api.get<InvitationPreviewDto>(`/invitations/by-token/${token}`),
    enabled: Boolean(token),
  })
}
