import { SectionMark } from '../SectionMark/SectionMark'
import styles from './PagePlaceholder.module.css'

type Props = {
  screen: string
  title: string
  phase: number
  note?: string
}

// temporary body for pages that land in a later phase of the roadmap
export function PagePlaceholder({ screen, title, phase, note }: Props) {
  return (
    <section className={styles.wrap}>
      <SectionMark num={screen}>{`Figma screen ${screen}`}</SectionMark>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.note}>
        {note ?? 'Route and layout are wired. The screen itself is built in'} phase {phase}.
      </p>
    </section>
  )
}
