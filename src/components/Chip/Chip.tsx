import type { ButtonHTMLAttributes } from 'react'
import { cx } from '@/utils/cx'
import styles from './Chip.module.css'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  on?: boolean
  count?: number
}

export function Chip({ on = false, count, children, className, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cx(styles.chip, on && styles.on, className)}
      {...rest}
    >
      {children}
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </button>
  )
}
