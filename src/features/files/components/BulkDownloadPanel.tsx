import { useEffect, useState } from 'react'
import { Button, FileKindBox, Modal, Tag } from '@/components'
import type { FileDto } from '@/api/types'
import { errorMessage } from '@/api/client'
import { IntegrityError } from '@/crypto'
import { decryptVersion, saveBlob } from '../download'
import styles from './BulkDownloadPanel.module.css'

type Row = { state: 'queued' | 'running' | 'saved' | 'failed'; detail: string }

type Props = { files: { file: FileDto; name: string }[]; onClose: () => void }

// several files, one after the other, each verified before it's saved (same rules as figma 37)
export function BulkDownloadPanel({ files, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    files.map(() => ({ state: 'queued', detail: 'waiting' })),
  )

  useEffect(() => {
    const ctrl = new AbortController()
    const set = (i: number, row: Row) =>
      !ctrl.signal.aborted && setRows((r) => r.map((x, j) => (j === i ? row : x)))

    ;(async () => {
      for (const [i, { file, name }] of files.entries()) {
        if (ctrl.signal.aborted) return
        set(i, { state: 'running', detail: 'fetching the wrapped key' })
        try {
          const { blob } = await decryptVersion(
            file.id,
            file.currentVersion.id,
            (p) =>
              p.stage === 'chunks' &&
              set(i, { state: 'running', detail: `chunk ${p.chunk} of ${p.chunkCount} verified` }),
            ctrl.signal,
          )
          if (ctrl.signal.aborted) return
          saveBlob(blob, name)
          set(i, { state: 'saved', detail: 'verified and saved' })
        } catch (err) {
          if (ctrl.signal.aborted) return
          set(i, {
            state: 'failed',
            detail:
              err instanceof IntegrityError
                ? `chunk ${err.index + 1} rejected, nothing saved`
                : errorMessage(err),
          })
        }
      }
    })()

    return () => ctrl.abort()
  }, [files])

  const done = rows.every((r) => r.state === 'saved' || r.state === 'failed')
  const saved = rows.filter((r) => r.state === 'saved').length

  return (
    <Modal
      open
      onClose={onClose}
      width={640}
      title={`Download and decrypt ${files.length} files`}
      subtitle={`${saved} of ${files.length} saved · one file at a time, each verified first`}
      footer={
        <Button variant={done ? 'primary' : 'ghost'} onClick={onClose}>
          {done ? 'Done' : 'Cancel the rest'}
        </Button>
      }
    >
      <ul className={styles.list}>
        {files.map(({ file, name }, i) => (
          <li key={file.id} className={styles.row}>
            <FileKindBox mimeType={file.mimeType} name={name} />
            <div className={styles.text}>
              <p>{name}</p>
              <span>{rows[i].detail}</span>
            </div>
            {rows[i].state === 'queued' && <Tag>Queued</Tag>}
            {rows[i].state === 'running' && <Tag tone="accent">Decrypting</Tag>}
            {rows[i].state === 'saved' && <Tag tone="accent">Verified</Tag>}
            {rows[i].state === 'failed' && <Tag tone="danger">Rejected</Tag>}
          </li>
        ))}
      </ul>
    </Modal>
  )
}
