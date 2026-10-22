import { useMemo } from 'react'
import { cx } from '@/utils/cx'
import styles from './CipherNoise.module.css'

// decorative hex block: "this is all the server ever sees"
export function CipherNoise({
  rows = 10,
  cols = 6,
  className,
}: {
  rows?: number
  cols?: number
  className?: string
}) {
  const text = useMemo(() => {
    const bytes = crypto.getRandomValues(new Uint8Array(rows * cols * 2))
    const lines: string[] = []
    for (let r = 0; r < rows; r++) {
      const groups: string[] = []
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 2
        groups.push(
          bytes[i].toString(16).padStart(2, '0') + bytes[i + 1].toString(16).padStart(2, '0'),
        )
      }
      lines.push(groups.join(' '))
    }
    return lines.join('\n')
  }, [rows, cols])

  return (
    <pre className={cx(styles.noise, className)} aria-hidden>
      {text}
    </pre>
  )
}
