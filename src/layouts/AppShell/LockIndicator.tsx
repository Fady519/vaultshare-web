import { useEffect, useState } from 'react'
import { Icon } from '@/components'
import { useSession } from '@/store/session'
import { cx } from '@/utils/cx'
import styles from './LockIndicator.module.css'

function mmss(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// always visible (book 3.22): the user must know if their keys are in memory right now
export function LockIndicator() {
  const unlocked = useSession((s) => s.privateKey !== null)
  const lockAt = useSession((s) => s.lockAt)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!unlocked) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [unlocked])

  const left = lockAt ? lockAt - now : 0
  const soon = unlocked && left < 60_000

  return (
    <span
      className={cx(styles.pill, unlocked ? styles.unlocked : styles.locked, soon && styles.soon)}
      title={
        unlocked ? 'Your private key is in memory on this device' : 'Your keys are not in memory'
      }
    >
      <Icon name="lock" size={12} />
      {unlocked ? (
        <>
          <span className={styles.word}>Unlocked</span>{' '}
          <span className={styles.time}>{mmss(left)}</span>
        </>
      ) : (
        <span className={styles.word}>Locked</span>
      )}
    </span>
  )
}
