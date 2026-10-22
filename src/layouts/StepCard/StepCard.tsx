import type { ReactNode } from 'react'
import { Logo } from '@/components'
import styles from './StepCard.module.css'

type Props = {
  children: ReactNode
  footer?: ReactNode
  // "Step 2 of 3" in the top right corner
  step?: string
  width?: number
}

// the centred card used by verify email, key ceremony, 2fa setup, recovery…
export function StepCard({ children, footer, step, width = 880 }: Props) {
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Logo />
        {step && <span className={styles.step}>{step}</span>}
      </header>
      <main className={styles.main}>
        <section className={styles.card} style={{ maxWidth: width }}>
          <div className={styles.body}>{children}</div>
          {footer && <footer className={styles.foot}>{footer}</footer>}
        </section>
      </main>
    </div>
  )
}
