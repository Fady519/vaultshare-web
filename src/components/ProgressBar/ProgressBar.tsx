import { cx } from '@/utils/cx'
import styles from './ProgressBar.module.css'

type Props = {
  // 0..1
  value: number
  label: string
  tone?: 'accent' | 'warn' | 'danger'
  className?: string
}

export function ProgressBar({ value, label, tone = 'accent', className }: Props) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cx(styles.track, className)}
    >
      <span className={cx(styles.fill, styles[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}
