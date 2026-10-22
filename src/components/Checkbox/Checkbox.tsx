import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cx } from '@/utils/cx'
import styles from './Checkbox.module.css'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: ReactNode
  // the grey second line under the label (the "Checkline" component in figma)
  sub?: ReactNode
}

export const Checkbox = forwardRef<HTMLInputElement, Props>(function Checkbox(
  { label, sub, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <label htmlFor={inputId} className={cx(styles.row, className)}>
      <input ref={ref} id={inputId} type="checkbox" className={styles.input} {...rest} />
      <span className={styles.box} aria-hidden>
        <svg viewBox="0 0 10 8" width="10" height="8">
          <path d="M1 4.4l2.6 2.6L9 1.6" />
        </svg>
      </span>
      {(label || sub) && (
        <span className={styles.text}>
          {label && <span className={styles.label}>{label}</span>}
          {sub && <span className={styles.sub}>{sub}</span>}
        </span>
      )}
    </label>
  )
})
