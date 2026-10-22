import { useState } from 'react'
import { cx } from '@/utils/cx'
import styles from './HashBlock.module.css'

type Props = {
  value: string
  label?: string
  copyable?: boolean
  // split hex into groups of 4 like "cd3b 8cbc f539"
  grouped?: boolean
  className?: string
}

export function HashBlock({ value, label, copyable, grouped, className }: Props) {
  const [copied, setCopied] = useState(false)
  const shown = grouped ? (value.match(/.{1,4}/g) ?? []).join(' ') : value

  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={cx(styles.block, className)}>
      {label && <span className={styles.label}>{label}</span>}
      <code className={styles.value}>{shown}</code>
      {copyable && (
        <button type="button" className={styles.copy} onClick={copy}>
          {copied ? 'copied' : 'copy'}
        </button>
      )}
    </div>
  )
}
