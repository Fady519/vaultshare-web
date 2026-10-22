import type { ReactNode } from 'react'
import { cx } from '@/utils/cx'
import styles from './DataCell.module.css'

type Props = {
  label: string
  children: ReactNode
  tone?: 'default' | 'accent' | 'warn'
  className?: string
}

export function DataCell({ label, children, tone = 'default', className }: Props) {
  return (
    <div className={cx(styles.cell, className)}>
      <dt className={styles.label}>{label}</dt>
      <dd className={cx(styles.value, styles[tone])}>{children}</dd>
    </div>
  )
}

export function DataGrid({ children, cols = 3 }: { children: ReactNode; cols?: number }) {
  return (
    <dl className={styles.grid} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {children}
    </dl>
  )
}
