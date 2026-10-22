import styles from './RecoveryWords.module.css'

// the 4 × 3 grid of numbered words from figma 03
export function RecoveryWords({ words }: { words: string[] }) {
  return (
    <ol className={styles.grid} aria-label="Recovery kit, twelve words">
      {words.map((w, i) => (
        <li key={i} className={styles.cell}>
          <span className={styles.num}>{String(i + 1).padStart(2, '0')}</span>
          <span className={styles.word}>{w}</span>
        </li>
      ))}
    </ol>
  )
}
