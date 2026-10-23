import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import { cx } from '@/utils/cx'
import styles from './Menu.module.css'

export type MenuItem = {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  hint?: string
}

type TriggerProps = { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }

type Props = {
  label: string
  items: MenuItem[]
  // defaults to the "⋮" button used in file rows
  trigger?: (props: TriggerProps) => ReactNode
  align?: 'left' | 'right'
}

const dotsTrigger = (label: string) => (props: TriggerProps) => (
  <button type="button" className={styles.dots} aria-label={label} {...props}>
    <Icon name="dots" />
  </button>
)

// the row "⋮" menu. arrow keys move, Esc closes and gives focus back
export function Menu({ label, items, trigger, align = 'right' }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function onKeyDown(e: React.KeyboardEvent) {
    const buttons = [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
    ]
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') {
      setOpen(false)
      wrapRef.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      buttons[(i + 1) % buttons.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus()
    }
  }

  return (
    <div className={styles.wrap} ref={wrapRef} onKeyDown={onKeyDown}>
      {(trigger ?? dotsTrigger(label))({
        onClick: () => setOpen((o) => !o),
        'aria-expanded': open,
        'aria-haspopup': 'menu',
      })}
      {open && (
        <ul ref={listRef} role="menu" aria-label={label} className={cx(styles.menu, styles[align])}>
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                title={item.hint}
                className={cx(item.danger && styles.danger)}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
