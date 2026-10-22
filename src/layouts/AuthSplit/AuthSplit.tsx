import type { ReactNode } from 'react'
import { Logo } from '@/components'
import styles from './AuthSplit.module.css'

type Props = {
  children: ReactNode
  // the right-hand panel that explains the guarantee
  aside?: ReactNode
  step?: string
}

// sign in / sign up: form on the left, explanation on the right
export function AuthSplit({ children, aside, step }: Props) {
  return (
    <div className={styles.split}>
      <div className={styles.left}>
        <header className={styles.head}>
          <Logo />
          {step && <span className={styles.step}>{step}</span>}
        </header>
        <main className={styles.form}>{children}</main>
      </div>
      {aside && <aside className={styles.aside}>{aside}</aside>}
    </div>
  )
}
