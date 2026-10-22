import { NavLink, useParams } from 'react-router-dom'
import { Icon, Logo, Skeleton, type IconName } from '@/components'
import { useVaults } from '@/api/vaults'
import { cx } from '@/utils/cx'
import { UserMenu } from './UserMenu'
import styles from './Sidebar.module.css'

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/vaults', label: 'Vaults', icon: 'folder' },
  { to: '/shared/with-me', label: 'Shared with me', icon: 'users' },
  { to: '/shared/by-me', label: 'Shared by me', icon: 'share' },
  { to: '/favorites', label: 'Favorites', icon: 'star' },
  { to: '/recent', label: 'Recent', icon: 'clock' },
  { to: '/search', label: 'Search', icon: 'search' },
  { to: '/audit', label: 'Audit log', icon: 'list' },
  { to: '/trash', label: 'Trash', icon: 'trash' },
]

export function Sidebar() {
  const { vaultId } = useParams()
  const vaults = useVaults()

  return (
    <aside className={styles.rail}>
      <div className={styles.logo}>
        <Logo to="/vaults" />
      </div>

      <nav aria-label="Main">
        <ul className={styles.nav}>
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) => cx(styles.link, isActive && styles.active)}
              >
                <Icon name={item.icon} />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>Vaults</span>
        <NavLink to="/vaults/new" className={styles.add} aria-label="New vault">
          <Icon name="plus" size={14} />
        </NavLink>
      </div>

      <ul className={styles.vaults}>
        {vaults.isPending &&
          [0, 1, 2].map((i) => (
            <li key={i} className={styles.vaultSkeleton}>
              <Skeleton width={`${50 + i * 12}%`} height={10} />
            </li>
          ))}
        {vaults.data?.map((v) => (
          <li key={v.id}>
            <NavLink
              to={`/vaults/${v.id}`}
              className={cx(styles.vault, v.id === vaultId && styles.vaultActive)}
            >
              <span className={styles.dot} aria-hidden />
              <span className={styles.vaultName}>{v.name}</span>
              <span className={styles.count}>{v.fileCount}</span>
            </NavLink>
          </li>
        ))}
        {vaults.isError && <li className={styles.error}>Couldn't load vaults</li>}
      </ul>

      <div className={styles.footer}>
        <UserMenu />
      </div>
    </aside>
  )
}
