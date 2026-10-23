import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon/Icon'
import { cx } from '@/utils/cx'
import styles from './EmptyState.module.css'

type Props = {
  icon?: IconName
  title: string
  // empty screens explain what the place is for, not just "nothing here"
  children?: ReactNode
  actions?: ReactNode
  // centered when it fills a whole page, like an empty vault
  center?: boolean
}

export function EmptyState({ icon = 'folder', title, children, actions, center }: Props) {
  return (
    <div className={cx(styles.empty, center && styles.center)}>
      <span className={styles.icon}>
        <Icon name={icon} size={20} />
      </span>
      <h2 className={styles.title}>{title}</h2>
      {children && <div className={styles.body}>{children}</div>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  )
}
