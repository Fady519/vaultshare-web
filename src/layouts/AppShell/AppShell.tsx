import { Outlet } from 'react-router-dom'
import { useIdleLock } from '@/hooks/useIdleLock'
import { useSession } from '@/store/session'
import { StepUpHost } from '@/features/auth/components/StepUpHost'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { UnlockPanel } from './UnlockPanel'
import styles from './AppShell.module.css'

// rail (248) + topbar (60) + content, same grid as every product screen in figma
export function AppShell() {
  useIdleLock()
  const unlocked = useSession((s) => s.privateKey !== null)

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <Sidebar />
      <div className={styles.column}>
        <Topbar />
        <main id="main" className={styles.main} tabIndex={-1}>
          <div className={styles.content}>{unlocked ? <Outlet /> : <UnlockPanel />}</div>
        </main>
      </div>
      <StepUpHost />
    </div>
  )
}
