import { api, refreshAccessToken } from '@/api/client'
import { authApi, invitationApi, keysApi } from '@/api/auth'
import { meKeys } from '@/api/me'
import { queryClient } from '@/api/queryClient'
import type { SessionResponse, UserDto } from '@/api/types'
import { toast } from '@/components'
import { unsealPrivateKey } from '@/crypto'
import { useSession } from '@/store/session'

// glue between the auth pages, the API and the in-memory session

export function startSession(res: SessionResponse) {
  useSession.getState().setSession(res.accessToken, res.user)
  queryClient.setQueryData(meKeys.me, res.user)
}

// only allow in-app paths after sign in (no open redirects)
export function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/vaults'
}

// where a user with this status belongs
export function homeFor(user: UserDto) {
  if (user.status === 'pendingKeys') return '/setup/keys'
  if (user.status === 'pendingMfa') return '/setup/2fa'
  return '/vaults'
}

// open the private key with the password-derived wrap key
export async function unlockWith(wrapKey: CryptoKey) {
  const keys = await keysApi.mine()
  const privateKey = await unsealPrivateKey(wrapKey, keys.sealedPrivateKey)
  useSession.getState().unlock(privateKey)
}

// page reload: the access token is gone but the refresh cookie may still be valid
export async function restoreSession() {
  const token = await refreshAccessToken()
  if (!token) return null
  try {
    const user = await api.get<UserDto>('/me')
    useSession.getState().setSession(token, user)
    queryClient.setQueryData(meKeys.me, user)
    return user
  } catch {
    return null
  }
}

export async function signOut() {
  try {
    await authApi.logout()
  } catch {
    // signing out locally is what matters
  }
  useSession.getState().clear()
  queryClient.clear()
}

// invite links survive the whole sign-up flow in sessionStorage (just a token, not a secret)
const INVITE_KEY = 'vaultshare.pending-invite'

export const rememberInvite = (token: string) => sessionStorage.setItem(INVITE_KEY, token)

export async function acceptPendingInvite() {
  const token = sessionStorage.getItem(INVITE_KEY)
  if (!token) return
  sessionStorage.removeItem(INVITE_KEY)
  try {
    await invitationApi.accept(token)
    toast(
      'Invitation accepted. Access appears once the inviter’s browser wraps the keys for you.',
      'ok',
    )
  } catch {
    toast('That invitation could not be accepted any more.', 'warn')
  }
}

// the email being verified, so a reload of /verify-email still knows it
const PENDING_EMAIL_KEY = 'vaultshare.pending-email'
export const setPendingEmail = (email: string) => sessionStorage.setItem(PENDING_EMAIL_KEY, email)
export const getPendingEmail = () => sessionStorage.getItem(PENDING_EMAIL_KEY)
export const clearPendingEmail = () => sessionStorage.removeItem(PENDING_EMAIL_KEY)
