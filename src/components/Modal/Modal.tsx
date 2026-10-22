import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cx } from '@/utils/cx'
import styles from './Modal.module.css'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  width?: number
  // false for flows that must not be dismissed halfway (key ceremony, uploads)
  dismissable?: boolean
  className?: string
}

// built on the native <dialog>: showModal() gives us the focus trap and Esc
// from the browser itself, we only put focus back where it was on close
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 680,
  dismissable = true,
  className,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const opener = document.activeElement as HTMLElement | null
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
      opener?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cx(styles.dialog, className)}
      style={{ width }}
      onCancel={(e) => {
        e.preventDefault()
        if (dismissable) onClose()
      }}
      onClick={(e) => {
        // click on the backdrop
        if (dismissable && e.target === e.currentTarget) onClose()
      }}
    >
      <div className={styles.panel}>
        <header className={styles.head}>
          <div>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {dismissable && (
            <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden>
                <path d="M0 0l10 10M10 0L0 10" />
              </svg>
            </button>
          )}
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.foot}>{footer}</footer>}
      </div>
    </dialog>
  )
}
