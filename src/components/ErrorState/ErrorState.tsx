import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon/Icon'
import { cx } from '@/utils/cx'
import styles from './ErrorState.module.css'

type Props = {
  // neutral: nothing is wrong, there is just nothing here. warn: you lack something. danger: data failed a check
  tone?: 'neutral' | 'warn' | 'danger'
  icon?: IconName
  // "404", "403 · no key for you", "tag mismatch"
  code: string
  title: string
  children: ReactNode
  actions?: ReactNode
  // h2 when the state sits inside a page that already has its h1
  heading?: 'h1' | 'h2'
}

// figma 50: every failure says what the system did, not what the user did wrong
export function ErrorState({
  tone = 'neutral',
  icon = 'file',
  code,
  title,
  children,
  actions,
  heading: Heading = 'h1',
}: Props) {
  return (
    <section
      className={cx(styles.state, styles[tone])}
      role={tone === 'danger' ? 'alert' : undefined}
    >
      <span className={styles.icon}>
        <Icon name={icon} size={18} />
      </span>
      <p className={styles.code}>{code}</p>
      <Heading className={styles.title}>{title}</Heading>
      <div className={styles.text}>{children}</div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </section>
  )
}
