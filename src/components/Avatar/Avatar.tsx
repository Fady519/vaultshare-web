import { initials } from '@/utils/format'
import { cx } from '@/utils/cx'
import styles from './Avatar.module.css'

// same tones as the avatars in the figma file
const TONES = ['#57C79E', '#5E7FA8', '#A8795E', '#7A6BA8', '#8E948B']

function toneFor(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return TONES[Math.abs(h) % TONES.length]
}

type Props = {
  name: string
  size?: 24 | 28 | 30 | 44
  src?: string | null
  className?: string
}

export function Avatar({ name, size = 28, src, className }: Props) {
  return (
    <span
      className={cx(styles.avatar, className)}
      style={{ width: size, height: size, background: toneFor(name), fontSize: size * 0.34 }}
      title={name}
    >
      {src ? <img src={src} alt="" /> : <span aria-hidden>{initials(name)}</span>}
      <span className="sr-only">{name}</span>
    </span>
  )
}

type StackProps = {
  people: { userId: string; displayName: string }[]
  max?: number
  size?: 24 | 28
}

export function AvatarStack({ people, max = 3, size = 24 }: StackProps) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length

  return (
    <span className={styles.stack}>
      {shown.map((p) => (
        <Avatar key={p.userId} name={p.displayName} size={size} className={styles.stacked} />
      ))}
      {extra > 0 && <span className={styles.extra}>+{extra}</span>}
    </span>
  )
}
