import { cx } from '@/utils/cx'
import styles from './SectionMark.module.css'

type Props = {
  num?: string
  children: string
  className?: string
}

// "01 —— TWO-FACTOR METHODS"
export function SectionMark({ num, children, className }: Props) {
  return (
    <p className={cx(styles.mark, className)}>
      {num && <span className={styles.num}>{num}</span>}
      <span className={styles.rule} aria-hidden />
      <span>{children}</span>
    </p>
  )
}
