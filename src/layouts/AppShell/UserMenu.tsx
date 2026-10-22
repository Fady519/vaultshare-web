import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar, Skeleton } from '@/components'
import { useMe } from '@/api/me'
import { signOut } from '@/features/auth/session'
import { useSession } from '@/store/session'
import styles from './UserMenu.module.css'

const LINKS = [
  { to: '/settings/profile', label: 'Profile' },
  { to: '/settings/security', label: 'Security' },
  { to: '/settings/sessions', label: 'Sessions & devices' },
  { to: '/settings/keys', label: 'Encryption keys' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/team', label: 'Team' },
  { to: '/storage', label: 'Storage & usage' },
  { to: '/settings/danger', label: 'Danger zone' },
]

export function UserMenu() {
  const me = useMe()
  const lock = useSession((s) => s.lock)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!me.data) {
    return (
      <div className={styles.trigger}>
        <Skeleton width={30} height={30} />
        <Skeleton width={110} height={10} />
      </div>
    )
  }

  const user = me.data
  const isAdmin = user.systemRole === 'admin'
  const isAuditor = user.systemRole === 'auditor'

  return (
    <div className={styles.wrap} ref={wrapRef}>
      {open && (
        <ul className={styles.menu} role="menu">
          {LINKS.map((l) => (
            <li key={l.to} role="none">
              <Link role="menuitem" to={l.to} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            </li>
          ))}
          {(isAdmin || isAuditor) && (
            <li role="none">
              <Link role="menuitem" to="/admin" onClick={() => setOpen(false)}>
                Administration
              </Link>
            </li>
          )}
          <li role="none" className={styles.sep}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                lock()
              }}
            >
              Lock now
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false)
                await signOut()
                navigate('/signin')
              }}
            >
              Sign out
            </button>
          </li>
        </ul>
      )}
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={user.displayName} src={user.avatarUrl} size={30} />
        <span className={styles.who}>
          <span className={styles.name}>{user.displayName}</span>
          <span className={styles.meta}>
            {user.systemRole === 'user' ? 'Member' : user.systemRole}
            {'  ·  '}
            {user.mfaEnabled ? 'MFA on' : 'MFA off'}
          </span>
        </span>
      </button>
    </div>
  )
}
