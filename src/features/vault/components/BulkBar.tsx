import { useEffect, useRef } from 'react'
import { Button } from '@/components'
import { formatBytes } from '@/utils/format'
import styles from './BulkBar.module.css'

type Props = {
  count: number
  total: number
  bytes: number
  keyCopies: number
  canWrite: boolean
  onToggleAll: (on: boolean) => void
  onMove: () => void
  onDownload: () => void
  onDelete: () => void
}

// figma 40: shows up above the list as soon as one row is ticked
export function BulkBar(p: Props) {
  const boxRef = useRef<HTMLInputElement>(null)
  const all = p.count === p.total

  useEffect(() => {
    if (boxRef.current) boxRef.current.indeterminate = !all
  }, [all])

  return (
    <div className={styles.bar} role="region" aria-label="Selected files">
      <input
        ref={boxRef}
        type="checkbox"
        className={styles.box}
        checked={all}
        aria-label={all ? 'Clear the selection' : 'Select every file'}
        onChange={() => p.onToggleAll(!all)}
      />
      <span className={styles.count}>
        {p.count} file{p.count === 1 ? '' : 's'} selected
      </span>
      <span className={styles.meta}>
        {formatBytes(p.bytes)} ciphertext · {p.keyCopies} wrapped key copies
      </span>
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" disabled title="Sharing is not wired up yet">
          Share
        </Button>
        <Button variant="ghost" size="sm" disabled={!p.canWrite} onClick={p.onMove}>
          Move
        </Button>
        <Button variant="ghost" size="sm" onClick={p.onDownload}>
          Download
        </Button>
        <Button variant="danger" size="sm" disabled={!p.canWrite} onClick={p.onDelete}>
          Delete
        </Button>
      </div>
    </div>
  )
}
