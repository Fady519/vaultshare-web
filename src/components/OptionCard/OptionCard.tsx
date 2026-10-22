import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon/Icon'
import { Tag, type TagTone } from '../Tag/Tag'
import { cx } from '@/utils/cx'
import styles from './OptionCard.module.css'

type Props = {
  name: string
  value: string
  checked: boolean
  onChange: (value: string) => void
  icon: IconName
  title: string
  children: ReactNode
  meta?: string
  tag?: { label: string; tone: TagTone }
  disabled?: boolean
}

// radio card: "Authenticator app / Security key" (figma 04), "I have my recovery kit" (10)
export function OptionCard({
  name,
  value,
  checked,
  onChange,
  icon,
  title,
  children,
  meta,
  tag,
  disabled,
}: Props) {
  return (
    <label className={cx(styles.card, checked && styles.checked, disabled && styles.disabled)}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className={styles.input}
      />
      <span className={styles.radio} aria-hidden />
      <Icon name={icon} className={styles.icon} />
      <span className={styles.body}>
        <span className={styles.title}>{title}</span>
        <span className={styles.text}>{children}</span>
        {meta && <span className={styles.meta}>{meta}</span>}
      </span>
      {tag && (
        <Tag tone={tag.tone} className={styles.tag}>
          {tag.label}
        </Tag>
      )}
    </label>
  )
}
