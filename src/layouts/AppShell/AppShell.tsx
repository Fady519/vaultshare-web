import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useIdleLock } from '@/hooks/useIdleLock'
import { useSession } from '@/store/session'
import { StepUpHost } from '@/features/auth/components/StepUpHost'
import { OfflineBanner } from '@/features/errors/OfflineBanner'
import { BottomNav } from './BottomNav'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { UnlockPanel } from './UnlockPanel'
import styles from './AppShell.module.css'

// rail (248) + topbar (60) + content, same grid as every product screen in figma.
// under 1024 the rail slides in from the left, under 640 a tab bar sits at the bottom
export function AppShell() {
  useIdleLock()
  const unlocked = useSession((s) => s.privateKey !== null)
  const [navOpen, setNavOpen] = useState(false)
  const { pathname } = useLocation()
  const closeNav = useCallback(() => setNavOpen(false), [])

  // a tap on a link inside the drawer closes it
  useEffect(() => closeNav(), [pathname, closeNav])

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <Sidebar open={navOpen} onClose={closeNav} />
      {navOpen && <div className={styles.scrim} aria-hidden onClick={closeNav} />}
      <div className={styles.column}>
        <Topbar navOpen={navOpen} onMenu={() => setNavOpen(true)} />
        <OfflineBanner />
        <main id="main" className={styles.main} tabIndex={-1}>
          <div className={styles.content}>{unlocked ? <Outlet /> : <UnlockPanel />}</div>
        </main>
      </div>
      <BottomNav />
      <StepUpHost />
    </div>
  )
}
