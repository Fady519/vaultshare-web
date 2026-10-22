import type { Strength } from '@/utils/passwordStrength'
import { cx } from '@/utils/cx'
import styles from './StrengthMeter.module.css'

// the "strong · 92 bits · never posted" box from figma 31
export function StrengthMeter({ strength }: { strength: Strength }) {
  const tone = strength.score >= 3 ? 'ok' : strength.score === 2 ? 'warn' : 'bad'

  return (
    <div className={styles.box} aria-live="polite">
      <div className={styles.text}>
        <span className={styles.label}>Strength</span>
        <span className={cx(styles.value, styles[tone])}>
          {strength.label}
          {strength.bits > 0 && ` · ${strength.bits} bits`} · never posted
        </span>
        {strength.hint && <span className={styles.hint}>{strength.hint}</span>}
      </div>
      <div className={styles.track} aria-hidden>
        <span
          className={cx(styles.fill, styles[tone])}
          style={{ width: `${Math.min(100, (strength.bits / 100) * 100)}%` }}
        />
      </div>
    </div>
  )
}
