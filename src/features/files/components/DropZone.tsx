import { useRef, useState, type DragEvent } from 'react'
import { CipherNoise } from '@/components'
import { cx } from '@/utils/cx'
import styles from './DropZone.module.css'

type Props = {
  onFiles: (files: File[]) => void
  multiple?: boolean
  compact?: boolean
}

// drag files here or click to pick them; the noise in the corner is what storage will see
export function DropZone({ onFiles, multiple = true, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    const files = [...e.dataTransfer.files]
    if (files.length) onFiles(files)
  }

  return (
    <div
      className={cx(styles.zone, over && styles.over, compact && styles.compact)}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {!compact && <CipherNoise rows={7} cols={4} className={styles.noise} />}
      <button type="button" className={styles.pick} onClick={() => inputRef.current?.click()}>
        {over ? 'Drop to encrypt' : compact ? 'Add more files' : 'Drag files here or choose them'}
      </button>
      {!compact && (
        <span className={styles.hint}>AES-256-GCM applied locally · max 5 GB per file</span>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          if (files.length) onFiles(files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
