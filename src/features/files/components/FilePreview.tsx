import { useEffect, useState } from 'react'
import { EmptyState } from '@/components'
import { cx } from '@/utils/cx'
import { isTextLike } from '../plaintext'
import styles from './FilePreview.module.css'

type Props = {
  blob: Blob
  mimeType: string
  name: string
  // the detail page shows a shorter page
  compact?: boolean
}

// renders decrypted bytes straight from memory through a blob: URL that dies with the component
export function FilePreview({ blob, mimeType, name, compact }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])

  useEffect(() => {
    if (!isTextLike(mimeType) || mimeType === 'image/svg+xml') return
    let alive = true
    blob.text().then((t) => alive && setText(t))
    return () => {
      alive = false
    }
  }, [blob, mimeType])

  if (!url) return null

  if (mimeType.startsWith('image/')) {
    return (
      <div className={cx(styles.frame, styles.image, compact && styles.compact)}>
        <img src={url} alt={name} />
      </div>
    )
  }

  if (mimeType === 'application/pdf') {
    return (
      <iframe
        title={name}
        src={url}
        className={cx(styles.frame, styles.pdf, compact && styles.compact)}
      />
    )
  }

  if (mimeType === 'text/csv' && text !== null) {
    const rows = text
      .trim()
      .split(/\r?\n/)
      .slice(0, 200)
      .map((line) => line.split(','))
    const [head, ...body] = rows
    return (
      <div className={cx(styles.frame, styles.paper, compact && styles.compact)}>
        <table className={styles.csv}>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (text !== null) {
    return (
      <div className={cx(styles.frame, styles.paper, compact && styles.compact)}>
        <pre className={styles.text}>{text}</pre>
      </div>
    )
  }

  if (isTextLike(mimeType)) return null

  return (
    <EmptyState icon="eye" title="No preview for this type">
      The file decrypted fine, the browser just can't show {mimeType || 'this format'} inline.
      Download it to open it with its own app.
    </EmptyState>
  )
}
