import { CipherNoise } from '@/components'
import styles from './AuthAside.module.css'

type Props = {
  title: string
  lead: string
  points: { title: string; text: string }[]
  footer?: string
}

// right half of sign in / sign up (figma 02, 08)
export function AuthAside({ title, lead, points, footer }: Props) {
  return (
    <div className={styles.aside}>
      <CipherNoise />
      <div className={styles.body}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.lead}>{lead}</p>
        <ul className={styles.points}>
          {points.map((p) => (
            <li key={p.title}>
              <span className={styles.dot} aria-hidden />
              <span>
                <strong>{p.title}</strong>
                <span className={styles.text}>{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      {footer && <p className={styles.footer}>{footer}</p>}
    </div>
  )
}
