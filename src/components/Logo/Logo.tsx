import { Link } from 'react-router-dom'
import styles from './Logo.module.css'

type Props = {
  to?: string
  size?: 'md' | 'lg'
}

export function Logo({ to = '/', size = 'md' }: Props) {
  return (
    <Link to={to} className={styles.logo} data-size={size} aria-label="VaultShare home">
      <span className={styles.mark} aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span className={styles.name}>VaultShare</span>
    </Link>
  )
}
