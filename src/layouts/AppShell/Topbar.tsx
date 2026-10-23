import { Fragment, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon, SearchBar } from '@/components'
import { useUi } from '@/store/ui'
import { useNotifications } from '@/api/settings'
import { LockIndicator } from './LockIndicator'
import styles from './Topbar.module.css'

export function Topbar() {
  const crumbs = useUi((s) => s.crumbs)
  const setSearchQuery = useUi((s) => s.setSearchQuery)
  const notifications = useNotifications()
  const unread = notifications.data?.filter((n) => !n.read).length ?? 0
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)

  // ctrl/cmd + K focuses the search box from anywhere
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className={styles.bar}>
      <nav aria-label="Breadcrumb" className={styles.crumbs}>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <Fragment key={`${c.label}-${i}`}>
              {i > 0 && <Icon name="chev" size={10} className={styles.sep} />}
              {c.to && !last ? (
                <Link to={c.to} className={styles.crumb}>
                  {c.label}
                </Link>
              ) : (
                <span
                  className={last ? styles.current : styles.crumb}
                  aria-current={last ? 'page' : undefined}
                >
                  {c.label}
                </span>
              )}
            </Fragment>
          )
        })}
      </nav>

      <div className={styles.tools}>
        <LockIndicator />
        <Link
          to="/notifications"
          className={styles.bell}
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Icon name="bell" />
          {unread > 0 && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
        </Link>
        <form
          role="search"
          className={styles.search}
          onSubmit={(e) => {
            e.preventDefault()
            const input = searchRef.current
            setSearchQuery(input?.value.trim() ?? '')
            if (input) input.value = ''
            navigate('/search')
          }}
        >
          <SearchBar ref={searchRef} placeholder="Search encrypted metadata" label="Search files" />
        </form>
      </div>
    </header>
  )
}
