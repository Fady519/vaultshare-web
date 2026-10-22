import { forwardRef, type InputHTMLAttributes } from 'react'
import { Icon } from '../Icon/Icon'
import { cx } from '@/utils/cx'
import styles from './SearchBar.module.css'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

type Props = InputHTMLAttributes<HTMLInputElement> & {
  size?: 'md' | 'lg'
  shortcut?: boolean
  label?: string
}

export const SearchBar = forwardRef<HTMLInputElement, Props>(function SearchBar(
  { size = 'md', shortcut = true, label = 'Search', className, ...rest },
  ref,
) {
  return (
    <div className={cx(styles.bar, styles[size], className)}>
      <Icon name="search" className={styles.icon} />
      <input ref={ref} type="search" aria-label={label} className={styles.input} {...rest} />
      {shortcut && <kbd className={styles.kbd}>{isMac ? '⌘K' : 'Ctrl K'}</kbd>}
    </div>
  )
})
