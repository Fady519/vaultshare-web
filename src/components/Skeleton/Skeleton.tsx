import { cx } from '@/utils/cx'
import styles from './Skeleton.module.css'

type Props = {
  width?: number | string
  height?: number | string
  className?: string
}

export function Skeleton({ width = '100%', height = 12, className }: Props) {
  return <span className={cx(styles.skeleton, className)} style={{ width, height }} aria-hidden />
}

// placeholder rows for any list while the query is loading
export function SkeletonRows({ rows = 6, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className={styles.rows} role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.row}>
          <Skeleton width={30} height={30} />
          <div className={styles.lines}>
            <Skeleton width={`${40 + ((i * 17) % 30)}%`} height={11} />
            <Skeleton width={120} height={8} />
          </div>
          <Skeleton width={80} height={10} />
        </div>
      ))}
    </div>
  )
}
