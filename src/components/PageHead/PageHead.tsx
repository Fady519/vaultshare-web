import type { ReactNode } from 'react'
import { Skeleton } from '../Skeleton/Skeleton'
import styles from './PageHead.module.css'

// title + mono meta line + actions: the top of almost every page
export function PageHead({
  title,
  meta,
  actions,
}: {
  // undefined while it's still loading / decrypting
  title: string | undefined
  meta: string
  actions?: ReactNode
}) {
  return (
    <header className={styles.head}>
      <div className={styles.text}>
        <h1 className={styles.title} title={title}>
          {title ?? <Skeleton width={280} height={28} />}
        </h1>
        <p className={styles.meta}>{meta}</p>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  )
}
