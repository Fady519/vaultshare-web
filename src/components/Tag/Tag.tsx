import type { ReactNode } from 'react'
import { cx } from '@/utils/cx'
import styles from './Tag.module.css'

export type TagTone = 'accent' | 'warn' | 'danger' | 'neutral' | 'solid'

type Props = {
  tone?: TagTone
  children: ReactNode
  className?: string
}

export function Tag({ tone = 'neutral', children, className }: Props) {
  return <span className={cx(styles.tag, styles[tone], className)}>{children}</span>
}
