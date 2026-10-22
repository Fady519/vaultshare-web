import { useToasts } from './toast'
import { cx } from '@/utils/cx'
import styles from './Toaster.module.css'

export function Toaster() {
  const items = useToasts((s) => s.items)
  const dismiss = useToasts((s) => s.dismiss)

  return (
    <div className={styles.stack} role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={cx(styles.toast, styles[t.tone])}>
          <span className={styles.bar} aria-hidden />
          <p>{t.message}</p>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
