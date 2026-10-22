import { forwardRef, useId, type SelectHTMLAttributes } from 'react'
import { Icon } from '../Icon/Icon'
import { cx } from '@/utils/cx'
import styles from './Select.module.css'

type Option = { value: string; label: string }

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  options: Option[]
  label?: string
  compact?: boolean
}

// native <select> on purpose: keyboard + screen reader support for free
export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { options, label, compact, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const selectId = id ?? autoId

  return (
    <div className={cx(styles.field, className)}>
      {label && (
        <label htmlFor={selectId} className={styles.label}>
          {label}
        </label>
      )}
      <div className={cx(styles.box, compact && styles.compact)}>
        <select ref={ref} id={selectId} className={styles.select} {...rest}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevD" size={14} className={styles.chev} />
      </div>
    </div>
  )
})
