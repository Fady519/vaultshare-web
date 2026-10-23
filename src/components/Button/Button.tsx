import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../Icon/Icon'
import { cx } from '@/utils/cx'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'soft' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  block?: boolean
  loading?: boolean
  // renders a router <Link> that looks like a button
  to?: string
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon,
    block,
    loading,
    to,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const classes = cx(
    styles.button,
    styles[variant],
    styles[size],
    block && styles.block,
    !children && styles.iconOnly,
    className,
  )

  const content = (
    <>
      {loading ? (
        <span className={styles.spinner} aria-hidden />
      ) : (
        icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />
      )}
      {children}
    </>
  )

  // a disabled link isn't a thing, it falls through to a disabled <button>
  if (to && !disabled) {
    return (
      <Link to={to} className={classes} aria-label={rest['aria-label']} title={rest.title}>
        {content}
      </Link>
    )
  }

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  )
})
