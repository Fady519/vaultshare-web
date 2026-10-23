import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Callout, FileKindBox, Modal, ProgressBar, Tag } from '@/components'
import type { FileDto, VersionDto } from '@/api/types'
import { fileKeys } from '@/api/files'
import { errorMessage } from '@/api/client'
import { CHUNK_SIZE, IntegrityError } from '@/crypto'
import { formatBytes, shortHash } from '@/utils/format'
import { decryptVersion, saveBlob, type DownloadProgress } from '../download'
import { digestHex } from '../plaintext'
import { StepList, type Step } from './StepList'
import styles from './DownloadPanel.module.css'

type Props = {
  open: boolean
  onClose: () => void
  file: FileDto
  name: string
  // defaults to the current version
  version?: VersionDto
}

type Outcome =
  | { kind: 'running' }
  | { kind: 'saved' }
  | { kind: 'integrity'; error: IntegrityError }
  | { kind: 'failed'; message: string }

const ORDER: DownloadProgress['stage'][] = ['fetch', 'unwrap', 'chunks', 'done']

function downloadSteps(p: DownloadProgress | null, outcome: Outcome): Step[] {
  const at = p ? ORDER.indexOf(p.stage) : 0
  const state = (i: number): Step['state'] => (at > i ? 'done' : at === i ? 'active' : 'todo')
  const steps: Step[] = [
    { label: 'Fetch wrapped key blob', detail: 'GET /files/…/download', state: state(0) },
    { label: 'Unwrap with your private key', detail: 'RSA-4096-OAEP · in tab', state: state(1) },
    {
      label: 'Stream and decrypt chunks',
      detail: `AES-256-GCM · ${p?.chunk ?? 0} of ${p?.chunkCount || '…'}`,
      state: state(2),
    },
    {
      label: 'Verify authentication tag',
      detail: 'reject on mismatch',
      state: at >= 3 ? 'done' : at === 2 ? 'active' : 'todo',
    },
  ]
  if (outcome.kind === 'integrity') {
    steps[2].state = 'failed'
    steps[3].state = 'failed'
  }
  if (outcome.kind === 'failed') {
    const i = steps.findIndex((s) => s.state === 'active')
    if (i >= 0) steps[i].state = 'failed'
  }
  return steps
}

// figma 37. the file only reaches the disk after every chunk passed its digest and GCM tag
export function DownloadPanel({ open, onClose, file, name, version }: Props) {
  const qc = useQueryClient()
  const v = version ?? file.currentVersion
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'running' })
  const [attempt, setAttempt] = useState(0)
  const blobRef = useRef<Blob | null>(null)

  useEffect(() => {
    if (!open) return
    const ctrl = new AbortController()
    setProgress(null)
    setOutcome({ kind: 'running' })
    blobRef.current = null

    // an aborted run (closed panel, StrictMode's second mount) must not paint over the live one
    const report = (p: DownloadProgress) => !ctrl.signal.aborted && setProgress(p)
    decryptVersion(file.id, v.id, report, ctrl.signal)
      .then(({ blob }) => {
        blobRef.current = blob
        saveBlob(blob, name)
        setOutcome({ kind: 'saved' })
        // the server logged the download, the detail page shows it
        qc.invalidateQueries({ queryKey: fileKeys.one(file.id) })
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return
        if (err instanceof IntegrityError) setOutcome({ kind: 'integrity', error: err })
        else setOutcome({ kind: 'failed', message: errorMessage(err) })
      })

    return () => {
      ctrl.abort()
      blobRef.current = null
    }
  }, [open, file.id, v.id, name, attempt, qc])

  const total = v.sizeBytes
  const done = progress ? Math.min(total, progress.chunk * CHUNK_SIZE) : 0
  const ratio =
    outcome.kind === 'saved'
      ? 1
      : progress?.chunkCount
        ? (progress.chunk + (progress.stage === 'fetch' ? 0 : 0.2)) / (progress.chunkCount + 0.2)
        : 0
  const running = outcome.kind === 'running'

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={700}
      title="Download and decrypt"
      subtitle={`${Math.round(ratio * 100)}% · ${formatBytes(done)} of ${formatBytes(total)}`}
      footer={
        running ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button loading>Save when verified</Button>
          </>
        ) : outcome.kind === 'saved' ? (
          <>
            <Button
              variant="ghost"
              onClick={() => blobRef.current && saveBlob(blobRef.current, name)}
            >
              Save again
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button icon="restore" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </>
        )
      }
    >
      <div className={styles.body}>
        <div className={styles.file}>
          <FileKindBox mimeType={file.mimeType} name={name} />
          <div className={styles.fileText}>
            <p className={styles.fileName}>{name}</p>
            <p className={styles.fileMeta}>
              {formatBytes(v.sizeBytes)} ciphertext · v{v.versionNo} · sha256{' '}
              {shortHash(digestHex(v.digest))}
            </p>
          </div>
          {running && <Tag tone="accent">Sealed</Tag>}
          {outcome.kind === 'saved' && <Tag tone="accent">Verified</Tag>}
          {(outcome.kind === 'integrity' || outcome.kind === 'failed') && (
            <Tag tone="danger">Rejected</Tag>
          )}
        </div>

        <p className={styles.heading}>Decrypting in your browser</p>
        <ProgressBar
          value={ratio}
          label="Decryption progress"
          tone={outcome.kind === 'integrity' || outcome.kind === 'failed' ? 'danger' : 'accent'}
        />
        <StepList steps={downloadSteps(progress, outcome)} />

        {outcome.kind === 'integrity' && (
          <Callout tone="danger" title={`Chunk ${outcome.error.index + 1} was rejected`}>
            {outcome.error.message}. The object in storage was changed or damaged after upload.
            Nothing was written to your disk and the partial plaintext was wiped.
          </Callout>
        )}
        {outcome.kind === 'failed' && (
          <Callout tone="danger" title="Could not decrypt">
            {outcome.message}
          </Callout>
        )}
        {outcome.kind === 'saved' && (
          <Callout tone="ok" icon="check" title="Verified and saved">
            Every chunk matched its digest and GCM tag. Your browser saved {name}.
          </Callout>
        )}

        <p className={styles.note}>
          The download only becomes a real file after the tag verifies. A corrupted or tampered
          object never reaches your disk.
        </p>
      </div>
    </Modal>
  )
}
