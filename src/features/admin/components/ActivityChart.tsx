import type { AdminOverviewDto } from '@/api/types'
import styles from './ActivityChart.module.css'

type Day = AdminOverviewDto['activity'][number]

const ROWS: { key: keyof Omit<Day, 'date'>; label: string }[] = [
  { key: 'uploads', label: 'Uploads' },
  { key: 'downloads', label: 'Downloads' },
  { key: 'shares', label: 'Shares & links' },
]

const W = 14 * 18
const H = 44

/*
  Fourteen days as three small multiples: one measure per strip, one hue, one
  scale per strip (each strip is its own chart, so no dual axis). The total
  sits next to each strip and every bar has its own tooltip.
*/
export function ActivityChart({ days }: { days: Day[] }) {
  return (
    <div className={styles.chart}>
      {ROWS.map((row) => {
        const values = days.map((d) => d[row.key])
        const max = Math.max(1, ...values)
        const total = values.reduce((a, b) => a + b, 0)
        return (
          <div key={row.key} className={styles.row}>
            <span className={styles.label}>{row.label}</span>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className={styles.svg}
              role="img"
              aria-label={`${row.label}, last 14 days: ${total} in total`}
            >
              <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} className={styles.base} />
              {days.map((d, i) => {
                const v = d[row.key]
                const h = v ? Math.max(3, (v / max) * (H - 4)) : 0
                return (
                  <g key={d.date}>
                    <title>{`${d.date}: ${v} ${row.label.toLowerCase()}`}</title>
                    {/* the hit area is the whole column, wider and taller than the bar */}
                    <rect x={i * 18} y={0} width={18} height={H} className={styles.hit} />
                    {h > 0 && (
                      <rect
                        x={i * 18 + 3}
                        y={H - h}
                        width={12}
                        height={h}
                        rx={2}
                        className={styles.bar}
                      />
                    )}
                  </g>
                )
              })}
            </svg>
            <span className={styles.total}>{total}</span>
          </div>
        )
      })}
      <div className={styles.axis}>
        <span>{days[0]?.date.slice(5)}</span>
        <span>today</span>
      </div>
    </div>
  )
}
