import { Outlet } from 'react-router-dom'
import { Button, Logo } from '@/components'
import styles from './PublicLayout.module.css'

const NAV = [
  { href: '#difference', label: 'The difference' },
  { href: '#how', label: 'How it works' },
  { href: '#compare', label: 'Compared' },
]

// marketing pages use the light "paper" theme
export function PublicLayout() {
  return (
    <div className={`theme-light ${styles.page}`}>
      <header className={styles.head}>
        <div className={styles.inner}>
          <Logo />
          <nav aria-label="Sections" className={styles.nav}>
            {NAV.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className={styles.actions}>
            <Button to="/signin" variant="ghost" size="sm">
              Sign in
            </Button>
            <Button to="/signup" variant="primary" size="sm" className={styles.dark}>
              Create an account
            </Button>
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className={styles.foot}>
        <div className={styles.inner}>
          <span>VaultShare · 2026</span>
          <span>HTI · Computer Science graduation project</span>
        </div>
      </footer>
    </div>
  )
}
