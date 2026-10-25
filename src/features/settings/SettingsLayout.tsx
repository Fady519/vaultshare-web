import { useEffect, useRef, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { PageHead } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'
import { cx } from '@/utils/cx'
import styles from './SettingsLayout.module.css'

const NAV = [
  { to: '/settings/profile', label: 'Profile & password' },
  { to: '/settings/security', label: 'Two-factor & idle lock' },
  { to: '/settings/sessions', label: 'Sessions & devices' },
  { to: '/settings/notifications', label: 'Notifications' },
  { to: '/settings/keys', label: 'Encryption keys' },
  { to: '/settings/danger', label: 'Danger zone' },
]

type Props = {
  title: string
  crumb: string
  meta: string
  actions?: ReactNode
  children: ReactNode
}

// figma 26: settings pages share the left menu; each page is still its own route
export function SettingsLayout({ title, crumb, meta, actions, children }: Props) {
  useCrumbs({ label: 'Settings', to: '/settings/profile' }, crumb)
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  // on a phone the menu is a sideways strip: keep the open page's tab in view
  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pathname])

  return (
    <>
      <PageHead title={title} meta={meta} actions={actions} />
      <div className={styles.grid}>
        <nav ref={navRef} aria-label="Settings" className={styles.nav}>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => cx(styles.link, isActive && styles.active)}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.content}>{children}</div>
      </div>
    </>
  )
}
