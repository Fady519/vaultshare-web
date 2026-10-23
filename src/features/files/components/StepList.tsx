import { Icon } from '@/components'
import { cx } from '@/utils/cx'
import styles from './StepList.module.css'

export type Step = {
  label: string
  // the small mono text on the right: "GET /files/…", "RSA-4096-OAEP · in tab"
  detail?: string
  state: 'todo' | 'active' | 'done' | 'failed'
}

// the live checklist in the upload and download panels
export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ul className={styles.list} aria-live="polite">
      {steps.map((s) => (
        <li key={s.label} className={cx(styles.step, styles[s.state])}>
          <span className={styles.mark} aria-hidden>
            {s.state === 'done' ? <Icon name="check" size={13} /> : <span className={styles.box} />}
          </span>
          <span className={styles.label}>
            {s.label}
            <span className="sr-only"> — {s.state}</span>
          </span>
          {s.detail && <span className={styles.detail}>{s.detail}</span>}
        </li>
      ))}
    </ul>
  )
}
