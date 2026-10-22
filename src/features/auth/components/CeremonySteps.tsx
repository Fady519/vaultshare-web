import { Icon } from '@/components'
import { cx } from '@/utils/cx'
import styles from './CeremonySteps.module.css'

export type StepState = 'waiting' | 'running' | 'done' | 'failed'

export type CeremonyStepRow = {
  label: string
  where: 'browser' | 'server'
  state: StepState
  ms?: number
}

// each cryptographic step named as it happens, and where it happens (book 3.20.2)
export function CeremonySteps({ steps }: { steps: CeremonyStepRow[] }) {
  return (
    <ol className={styles.list} aria-live="polite">
      {steps.map((st, i) => (
        <li key={st.label} className={cx(styles.row, styles[st.state])}>
          <span className={styles.mark} aria-hidden>
            {st.state === 'done' ? (
              <Icon name="check" size={14} />
            ) : st.state === 'running' ? (
              <span className={styles.spin} />
            ) : (
              String(i + 1).padStart(2, '0')
            )}
          </span>
          <span className={styles.label}>
            {st.label}
            <span className="sr-only"> — {st.state}</span>
          </span>
          <span className={styles.ms}>{st.ms !== undefined ? `${st.ms} ms` : ''}</span>
          <span className={cx(styles.where, st.where === 'server' && styles.server)}>
            {st.where}
          </span>
        </li>
      ))}
    </ol>
  )
}
