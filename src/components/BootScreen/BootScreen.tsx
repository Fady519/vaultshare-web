import { Logo } from '../Logo/Logo'
import styles from './BootScreen.module.css'

export function BootScreen({ message = 'Restoring your session' }: { message?: string }) {
  return (
    <div className={styles.screen} role="status" aria-live="polite">
      <Logo />
      <p className={styles.text}>
        {message}
        <span className={styles.dots} aria-hidden>
          …
        </span>
      </p>
    </div>
  )
}
