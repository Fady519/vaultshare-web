import type { ReactNode } from 'react'
import { Skeleton } from '@/components'
import styles from './FileHead.module.css'

// title row shared by the detail, versions and preview pages
export function FileHead({
  name,
  meta,
  actions,
}: {
  name: string | undefined
  meta: string
  actions?: ReactNode
}) {
  return (
    <header className={styles.head}>
      <div className={styles.text}>
        <h1 className={styles.title} title={name}>
          {name ?? <Skeleton width={280} height={28} />}
        </h1>
        <p className={styles.meta}>{meta}</p>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  )
}
