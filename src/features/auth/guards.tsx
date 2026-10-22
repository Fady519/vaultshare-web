import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { UserStatus } from '@/api/types'
import { BootScreen } from '@/components'
import { useSession } from '@/store/session'
import { homeFor, restoreSession } from './session'

/*
  Pages behind a session. On a fresh load there is no access token in memory,
  so we try the refresh cookie once before sending the user to sign in.
  `allow` = which account states may see these pages (onboarding vs app).
*/
export function RequireSession({ allow }: { allow: UserStatus[] }) {
  const user = useSession((s) => s.user)
  const token = useSession((s) => s.accessToken)
  const location = useLocation()
  const [checked, setChecked] = useState(Boolean(user && token))

  useEffect(() => {
    if (checked) return
    let cancelled = false
    restoreSession().finally(() => {
      if (!cancelled) setChecked(true)
    })
    return () => {
      cancelled = true
    }
  }, [checked])

  if (!user || !token) {
    if (!checked) return <BootScreen />
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/signin?next=${next}`} replace />
  }

  if (!allow.includes(user.status)) return <Navigate to={homeFor(user)} replace />

  return <Outlet />
}

// sign in / sign up make no sense for someone already inside
export function GuestOnly() {
  const user = useSession((s) => s.user)
  const token = useSession((s) => s.accessToken)
  if (user && token && user.status === 'active') return <Navigate to="/vaults" replace />
  return <Outlet />
}
