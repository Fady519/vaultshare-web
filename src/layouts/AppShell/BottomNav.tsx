import { Link, useLocation } from 'react-router-dom'
import { Icon, type IconName } from '@/components'
import { cx } from '@/utils/cx'
import styles from './BottomNav.module.css'

// figma 28 / 54: four tabs, only on phones. everything else is one tap away in the drawer
const TABS: { to: string; label: string; icon: IconName; owns: string[] }[] = [
  { to: '/vaults', label: 'Vaults', icon: 'folder', owns: ['/vaults', '/files'] },
  { to: '/shared/with-me', label: 'Shared', icon: 'users', owns: ['/shared'] },
  { to: '/recent', label: 'Recent', icon: 'clock', owns: ['/recent'] },
  {
    to: '/settings/profile',
    label: 'Settings',
    icon: 'cog',
    owns: ['/settings', '/notifications', '/team', '/storage', '/admin'],
  },
]

export function BottomNav() {
  const { pathname } = useLocation()

  return (
    <nav aria-label="Tabs" className={styles.bar}>
      {TABS.map((t) => {
        const active = t.owns.some((p) => pathname === p || pathname.startsWith(`${p}/`))
        return (
          <Link
            key={t.to}
            to={t.to}
            className={cx(styles.tab, active && styles.active)}
            aria-current={active ? 'page' : undefined}
          >
            <Icon name={t.icon} size={18} />
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
