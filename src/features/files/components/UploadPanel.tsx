import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Callout,
  DataCell,
  DataGrid,
  FileKindBox,
  HashBlock,
  Modal,
  ProgressBar,
  SectionMark,
  Tag,
  TextField,
  toast,
} from '@/components'
import { fileKeys } from '@/api/files'
import { vaultKeys } from '@/api/vaults'
import { errorMessage } from '@/api/client'
import { formatBytes, formatNumber } from '@/utils/format'
import { cx } from '@/utils/cx'
import { uploadFile, type UploadProgress } from '../upload'
import { DropZone } from './DropZone'
import { StepList, type Step } from './StepList'
import styles from './UploadPanel.module.css'

type Item = { file: File; state: 'queued' | 'running' | 'done' | 'failed'; error?: string }

type Props = {
  open: boolean
  onClose: () => void
  vaultId: string
  vaultName: string
  initialFiles?: File[]
  // uploading a new version of this file instead of new files
  existing?: { fileId: string; name: string }
}

const STAGE_TEXT: Record<UploadProgress['stage'], string> = {
  prepare: 'Asking for upload slots',
  encrypt: 'Encrypting with AES-256-GCM',
  wrap: 'Wrapping the data key',
  commit: 'Committing',
  done: 'Done',
}

const ORDER: UploadProgress['stage'][] = ['prepare', 'encrypt', 'wrap', 'commit', 'done']

function uploadSteps(p: UploadProgress): Step[] {
  const at = ORDER.indexOf(p.stage)
  const state = (i: number): Step['state'] => (at > i ? 'done' : at === i ? 'active' : 'todo')
  return [
    { label: 'Data key generated · 256-bit, CSPRNG', state: at >= 1 ? 'done' : 'active' },
    { label: `Stream encrypted in 4 MiB chunks · ${p.chunk} of ${p.chunkCount}`, state: state(1) },
    {
      label: `Wrap data key to ${p.recipients.length || 'each'} recipient public key${p.recipients.length === 1 ? '' : 's'}`,
      state: state(2),
    },
    { label: 'Commit sealed name, digests and wrapped keys', state: state(3) },
  ]
}

export function UploadPanel({ open, onClose, vaultId, vaultName, initialFiles, existing }: Props) {
  const qc = useQueryClient()
  const [items, setItems] = useState<Item[]>([])
  const [note, setNote] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    setItems((initialFiles ?? []).map((file) => ({ file, state: 'queued' })))
    setNote('')
    setProgress(null)
  }, [open, initialFiles])

  const current =
    items.find((i) => i.state === 'running') ?? items.find((i) => i.state === 'queued')
  const finished =
    items.length > 0 && items.every((i) => i.state === 'done' || i.state === 'failed')

  function addFiles(files: File[]) {
    const list = existing ? files.slice(0, 1) : files
    setItems((prev) =>
      (existing ? [] : prev).concat(list.map((file) => ({ file, state: 'queued' }))),
    )
  }

  async function start() {
    setRunning(true)
    abortRef.current = new AbortController()
    for (const item of items) {
      if (item.state !== 'queued') continue
      setItems((prev) => prev.map((i) => (i.file === item.file ? { ...i, state: 'running' } : i)))
      try {
        await uploadFile({
          vaultId,
          data: item.file,
          name: existing ? existing.name : item.file.name,
          mimeType: item.file.type,
          fileId: existing?.fileId ?? null,
          note: existing ? note : undefined,
          signal: abortRef.current.signal,
          onProgress: setProgress,
        })
        setItems((prev) => prev.map((i) => (i.file === item.file ? { ...i, state: 'done' } : i)))
      } catch (err) {
        const error = (err as Error).name === 'AbortError' ? 'Cancelled' : errorMessage(err)
        setItems((prev) =>
          prev.map((i) => (i.file === item.file ? { ...i, state: 'failed', error } : i)),
        )
        if ((err as Error).name === 'AbortError') break
      }
    }
    setRunning(false)
    qc.invalidateQueries({ queryKey: fileKeys.vault(vaultId) })
    qc.invalidateQueries({ queryKey: vaultKeys.all })
    if (existing) {
      qc.invalidateQueries({ queryKey: fileKeys.one(existing.fileId) })
      qc.invalidateQueries({ queryKey: fileKeys.versions(existing.fileId) })
    }
  }

  function close() {
    if (running) return
    if (items.some((i) => i.state === 'done')) toast('Encrypted and uploaded.', 'ok')
    onClose()
  }

  const p = progress
  const pct = finished
    ? 100
    : p && current
      ? Math.round((p.bytesDone / Math.max(1, current.file.size)) * 100)
      : 0

  return (
    <Modal
      open={open}
      onClose={close}
      dismissable={!running}
      width={760}
      title={existing ? `New version of ${existing.name}` : `Upload to ${vaultName}`}
      subtitle="The plaintext never leaves this tab. Only ciphertext is sent."
      footer={
        finished ? (
          <Button onClick={close}>Done</Button>
        ) : running ? (
          <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
            Cancel
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button icon="lock" disabled={items.length === 0} onClick={start}>
              Encrypt and upload
            </Button>
          </>
        )
      }
    >
      <div className={styles.body}>
        {!running && !finished && (
          <DropZone onFiles={addFiles} multiple={!existing} compact={items.length > 0} />
        )}

        {items.length > 0 && (
          <ul className={styles.queue}>
            {items.map((item) => (
              <li
                key={item.file.name + item.file.size}
                className={cx(styles.file, item === current && running && styles.active)}
              >
                <FileKindBox mimeType={item.file.type} name={item.file.name} />
                <div className={styles.fileText}>
                  <p className={styles.fileName}>{existing ? existing.name : item.file.name}</p>
                  <p className={styles.fileMeta}>
                    {formatNumber(item.file.size)} bytes ·{' '}
                    {item.file.type || 'application/octet-stream'}
                    {item.error && <span className={styles.err}> · {item.error}</span>}
                  </p>
                </div>
                {item.state === 'queued' && !running && (
                  <button
                    type="button"
                    className={styles.remove}
                    aria-label={`Remove ${item.file.name}`}
                    onClick={() => setItems((prev) => prev.filter((i) => i !== item))}
                  >
                    ×
                  </button>
                )}
                {item.state === 'running' && <Tag tone="accent">Encrypting</Tag>}
                {item.state === 'done' && <Tag tone="accent">Sealed</Tag>}
                {item.state === 'failed' && <Tag tone="danger">Failed</Tag>}
                {item.state === 'queued' && running && <Tag tone="neutral">Queued</Tag>}
              </li>
            ))}
          </ul>
        )}

        {existing && !running && !finished && (
          <TextField
            label="Version note (encrypted)"
            placeholder="What changed, e.g. Redlined clause 7.2"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            hint="Sealed with this version's key, the server can't read it."
          />
        )}

        {p && (running || finished) && (
          <section className={styles.crypto} aria-live="polite">
            <SectionMark>Client-side encryption</SectionMark>
            <div className={styles.stageRow}>
              <span>{STAGE_TEXT[p.stage]}</span>
              <span className={styles.pct}>{pct}%</span>
            </div>
            <ProgressBar value={pct / 100} label="Encryption progress" />

            <StepList steps={uploadSteps(p)} />

            {p.sample && <HashBlock label="First bytes of ciphertext" value={p.sample} grouped />}

            <DataGrid cols={3}>
              <DataCell label="IV" tone="accent">
                {p.iv ?? '…'}
              </DataCell>
              <DataCell label="Auth tag" tone="accent">
                {p.tag ?? '…'}
              </DataCell>
              <DataCell label="WrappedKeys[]" tone="accent">
                {p.recipients.length ? `${p.recipients.length} recipients` : '…'}
              </DataCell>
            </DataGrid>

            {p.recipients.length > 0 && (
              <ul className={styles.recipients}>
                {p.recipients.map((r) => (
                  <li key={r.userId}>
                    <span>{r.displayName}</span>
                    <code>{r.fingerprint}</code>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {finished && items.some((i) => i.state === 'failed') && (
          <Callout tone="danger" title="Some files were not uploaded">
            Nothing partial was kept for them. Fix the problem and upload them again.
          </Callout>
        )}

        {!p && items.length > 0 && (
          <p className={styles.note}>
            Each file gets its own random key. It is encrypted here first, then only ciphertext goes
            to storage. {formatBytes(items.reduce((n, i) => n + i.file.size, 0))} in total.
          </p>
        )}
      </div>
    </Modal>
  )
}
