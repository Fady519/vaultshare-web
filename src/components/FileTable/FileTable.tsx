import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { FileKindBox } from '../FileKindBox/FileKindBox'
import { AvatarStack } from '../Avatar/Avatar'
import { Icon } from '../Icon/Icon'
import { cx } from '@/utils/cx'
import styles from './FileTable.module.css'

const DEFAULT_COLUMNS = ['File', 'Encrypted', 'Version', 'Access', 'Last activity']

export function FileTable({
  children,
  columns = DEFAULT_COLUMNS,
  selectable,
}: {
  children: ReactNode
  columns?: string[]
  selectable?: boolean
}) {
  return (
    <div role="table" className={cx(styles.table, selectable && styles.selectable)}>
      <div role="row" className={cx(styles.grid, styles.head)}>
        {selectable && <span role="columnheader" aria-label="Select" />}
        {columns.map((c) => (
          <span key={c} role="columnheader">
            {c}
          </span>
        ))}
        <span role="columnheader" aria-label="Actions" />
      </div>
      <div role="rowgroup">{children}</div>
    </div>
  )
}

export type FileRowProps = {
  name: string
  mimeType: string
  meta: string
  cipher?: string
  version: string
  people: { userId: string; displayName: string }[]
  when: string
  who?: string
  favorite?: boolean
  selected?: boolean
  // shift = extend the selection like a file manager
  onSelect?: (selected: boolean, shift: boolean) => void
  onOpen?: () => void
  onMenu?: (e: ReactMouseEvent<HTMLButtonElement>) => void
}

// the most reused piece of the product: one file, its state and its menu
export function FileRow({
  name,
  mimeType,
  meta,
  cipher = 'AES-256-GCM',
  version,
  people,
  when,
  who,
  favorite,
  selected,
  onSelect,
  onOpen,
  onMenu,
}: FileRowProps) {
  return (
    <div
      role="row"
      aria-selected={onSelect ? Boolean(selected) : undefined}
      className={cx(styles.grid, styles.row, selected && styles.selected)}
    >
      {onSelect && (
        <span role="cell" className={styles.check}>
          <input
            type="checkbox"
            checked={Boolean(selected)}
            aria-label={`Select ${name}`}
            onChange={(e) => onSelect(e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)}
          />
        </span>
      )}
      <span role="cell" className={styles.file}>
        <span className={styles.kind}>
          <FileKindBox mimeType={mimeType} name={name} />
          {favorite && <Icon name="star" size={9} filled className={styles.star} label="Favorite" />}
        </span>
        <span className={styles.names}>
          <button type="button" className={styles.name} onClick={onOpen} title={name}>
            {name}
          </button>
          <span className={styles.meta}>{meta}</span>
        </span>
      </span>
      <span role="cell" className={styles.cipher}>
        {cipher}
      </span>
      <span role="cell" className={styles.version}>
        {version}
      </span>
      <span role="cell">
        <AvatarStack people={people} />
      </span>
      <span role="cell" className={styles.when}>
        <span>{when}</span>
        {who && <span className={styles.who}>{who}</span>}
      </span>
      <span role="cell" className={styles.actions}>
        {onMenu && (
          <button type="button" className={styles.menu} onClick={onMenu} aria-label={`Actions for ${name}`}>
            <Icon name="dots" />
          </button>
        )}
      </span>
    </div>
  )
}
