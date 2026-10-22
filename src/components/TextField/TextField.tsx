import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import { cx } from '@/utils/cx'
import styles from './TextField.module.css'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: ReactNode
  error?: string
  valid?: boolean
  mono?: boolean
  // e.g. a "show" button inside the box
  trailing?: ReactNode
}

export const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { label, hint, error, valid, mono, trailing, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = `${inputId}-hint`
  const hasHint = Boolean(error || hint)

  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <div
        className={cx(styles.box, error && styles.error, valid && !error && styles.valid)}
      >
        <input
          ref={ref}
          id={inputId}
          className={cx(styles.input, mono && styles.mono)}
          aria-invalid={error ? true : undefined}
          aria-describedby={hasHint ? hintId : undefined}
          {...rest}
        />
        {valid && !error && <Icon name="check" className={styles.check} />}
        {trailing}
      </div>
      {hasHint && (
        <p id={hintId} className={cx(styles.hint, error && styles.hintError)} role={error ? 'alert' : undefined}>
          {error || hint}
        </p>
      )}
    </div>
  )
})
