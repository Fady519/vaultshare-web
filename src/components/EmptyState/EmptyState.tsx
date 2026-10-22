import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon/Icon'
import styles from './EmptyState.module.css'

type Props = {
  icon?: IconName
  title: string
  // empty screens explain what the place is for, not just "nothing here"
  children?: ReactNode
  actions?: ReactNode
}

export function EmptyState({ icon = 'folder', title, children, actions }: Props) {
  return (
    <div className={styles.empty}>
      <span className={styles.icon}>
        <Icon name={icon} size={20} />
      </span>
      <h2 className={styles.title}>{title}</h2>
      {children && <div className={styles.body}>{children}</div>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  )
}
