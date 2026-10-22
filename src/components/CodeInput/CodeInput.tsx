import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { cx } from '@/utils/cx'
import styles from './CodeInput.module.css'

type Props = {
  value: string
  onChange: (value: string) => void
  // fired once all boxes are filled, handy for auto-submit
  onComplete?: (value: string) => void
  length?: number
  label: string
  error?: boolean
  disabled?: boolean
  autoFocus?: boolean
}

// the 6 boxes used for email codes and authenticator codes
export function CodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  label,
  error,
  disabled,
  autoFocus,
}: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.padEnd(length, ' ').slice(0, length).split('')

  function update(next: string) {
    const clean = next.replace(/\D/g, '').slice(0, length)
    onChange(clean)
    if (clean.length === length) onComplete?.(clean)
    return clean
  }

  function setDigit(i: number, d: string) {
    const arr = value.split('')
    arr[i] = d
    const clean = update(arr.join(''))
    refs.current[Math.min(clean.length, length - 1)]?.focus()
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const at = digits[i].trim() ? i : i - 1
      if (at < 0) return
      update(value.slice(0, at) + value.slice(at + 1))
      refs.current[at]?.focus()
    } else if (e.key === 'ArrowLeft') {
      refs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowRight') {
      refs.current[i + 1]?.focus()
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const clean = update(e.clipboardData.getData('text'))
    refs.current[Math.min(clean.length, length - 1)]?.focus()
  }

  return (
    <div role="group" aria-label={label} className={styles.row}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          className={cx(styles.box, d.trim() && styles.filled, error && styles.error)}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${i + 1} of ${length}`}
          value={d.trim()}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '')
            if (v) setDigit(i, v[v.length - 1])
          }}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  )
}
