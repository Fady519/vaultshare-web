import type { ReactNode } from 'react'
import { cx } from '@/utils/cx'
import styles from './StateDot.module.css'

type Props = {
  state: 'ok' | 'warn' | 'off'
  // always pass text, colour alone never carries the meaning (WCAG 1.4.1)
  children: ReactNode
  className?: string
}

export function StateDot({ state, children, className }: Props) {
  return (
    <span className={cx(styles.wrap, className)}>
      <span className={cx(styles.dot, styles[state])} aria-hidden />
      <span className={styles.text}>{children}</span>
    </span>
  )
}
