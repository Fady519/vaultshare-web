import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon/Icon'
import { cx } from '@/utils/cx'
import styles from './Callout.module.css'

type Props = {
  tone?: 'info' | 'ok' | 'warn' | 'danger'
  icon?: IconName
  title?: string
  children: ReactNode
  className?: string
}

export function Callout({ tone = 'info', icon = 'shield', title, children, className }: Props) {
  return (
    <div
      className={cx(styles.callout, styles[tone], className)}
      role={tone === 'danger' ? 'alert' : undefined}
    >
      <Icon name={icon} className={styles.icon} />
      <div className={styles.text}>
        {title && <p className={styles.title}>{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  )
}
