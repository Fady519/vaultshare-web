import { Icon } from '../Icon/Icon'
import { cx } from '@/utils/cx'
import styles from './Toggle.module.css'

type Props = {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  // locked = can't be turned off and we say why (e.g. security alerts)
  lockedReason?: string
}

export function Toggle({ checked, onChange, label, disabled, lockedReason }: Props) {
  const locked = Boolean(lockedReason)

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled || locked}
        title={lockedReason}
        className={cx(styles.toggle, checked && styles.on)}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.knob} />
      </button>
      {locked && <Icon name="lock" size={14} className={styles.lock} label={lockedReason} />}
    </span>
  )
}
