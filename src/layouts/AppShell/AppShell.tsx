import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import styles from './AppShell.module.css'

// rail (248) + topbar (60) + content, same grid as every product screen in figma
export function AppShell() {
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <Sidebar />
      <div className={styles.column}>
        <Topbar />
        <main id="main" className={styles.main} tabIndex={-1}>
          <div className={styles.content}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
