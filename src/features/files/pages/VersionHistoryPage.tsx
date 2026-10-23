import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Avatar, Button, Callout, PageHead, SkeletonRows, Tag } from '@/components'
import { useFileDetail, useFileVersions } from '@/api/files'
import type { VersionDto } from '@/api/types'
import { useCrumbs } from '@/hooks/useCrumbs'
import { cx } from '@/utils/cx'
import { formatBytes, formatWhen, shortHash } from '@/utils/format'
import { useFileName, useVersionNotes } from '../keys'
import { canPreview, digestHex, isTextLike, usePlaintext } from '../plaintext'
import { lineDiff, type LineDiff } from '../diff'
import { DownloadPanel } from '../components/DownloadPanel'
import { RestoreDialog } from '../components/RestoreDialog'
import { UploadPanel } from '../components/UploadPanel'
import { fileAccess } from '../access'
import styles from './VersionHistoryPage.module.css'

export default function VersionHistoryPage() {
  const { fileId } = useParams()
  const detail = useFileDetail(fileId)
  const file = detail.data?.file
  const name = useFileName(file)
  const access = fileAccess(detail.data)
  const versions = useFileVersions(fileId)
  const notes = useVersionNotes(versions.data)

  const [downloading, setDownloading] = useState<VersionDto | null>(null)
  const [restoring, setRestoring] = useState<VersionDto | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)

  useCrumbs(
    ...(access.viaShare ? [] : [{ label: 'Vaults', to: '/vaults' }]),
    access.crumb,
    name ? { label: name, to: `/files/${fileId}` } : '…',
    'Versions',
  )

  const list = useMemo(
    () => [...(versions.data ?? [])].sort((a, b) => b.versionNo - a.versionNo),
    [versions.data],
  )
  const current = list[0]
  const canWrite = access.canWrite

  if (detail.isError || versions.isError) {
    return (
      <Callout tone="danger" title="The version history could not be loaded">
        The file may have been deleted, or you no longer have access to it.
      </Callout>
    )
  }

  return (
    <>
      <PageHead
        title={name}
        meta={
          list.length
            ? `${list.length} version${list.length === 1 ? '' : 's'}  ·  every version separately encrypted  ·  digests over ciphertext`
            : ' '
        }
        actions={
          <>
            <Button
              variant="ghost"
              icon="down"
              disabled={!current || !name}
              onClick={() => setDownloading(current)}
            >
              Download v{current?.versionNo ?? ''}
            </Button>
            <Button icon="upload" disabled={!canWrite || !name} onClick={() => setUploadOpen(true)}>
              Upload new version
            </Button>
          </>
        }
      />

      {versions.isPending && <SkeletonRows rows={4} />}

      {list.length > 0 && (
        <div role="table" className={styles.table} aria-label="Versions">
          <div role="row" className={cx(styles.row, styles.headRow)}>
            <span role="columnheader">Version</span>
            <span role="columnheader">Author</span>
            <span role="columnheader">Committed</span>
            <span role="columnheader">Size</span>
            <span role="columnheader">Ciphertext digest</span>
            <span role="columnheader">Note</span>
            <span role="columnheader" aria-label="Actions" />
          </div>
          {list.map((v) => {
            const isCurrent = v.id === current.id
            return (
              <div key={v.id} role="row" className={cx(styles.row, isCurrent && styles.current)}>
                <span role="cell" className={styles.no}>
                  v{v.versionNo}
                  {isCurrent && <Tag tone="accent">Current</Tag>}
                  {!isCurrent && v.versionNo === 1 && <Tag>Original</Tag>}
                </span>
                <span role="cell" className={styles.author}>
                  <Avatar name={v.createdBy.displayName} size={24} />
                  {v.createdBy.displayName}
                </span>
                <span role="cell" className={styles.mono}>
                  {formatWhen(v.createdAt)}
                </span>
                <span role="cell" className={styles.mono}>
                  {formatBytes(v.sizeBytes)}
                </span>
                <span role="cell" className={styles.mono} title={digestHex(v.digest)}>
                  sha256 {shortHash(digestHex(v.digest))}
                </span>
                <span role="cell" className={styles.note}>
                  {!v.wrappedKey ? (
                    <em>no key for this version</em>
                  ) : (
                    (notes.data?.[v.id] ?? '…') || <em>no note</em>
                  )}
                </span>
                <span role="cell" className={styles.actions}>
                  {file && canPreview(file.mimeType) && v.wrappedKey && (
                    <Button
                      variant="ghost"
                      size="sm"
                      to={`/files/${fileId}/preview?v=${v.id}`}
                      aria-label={`Preview v${v.versionNo}`}
                    >
                      Preview
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!v.wrappedKey || !name}
                    onClick={() => setDownloading(v)}
                    aria-label={`Download v${v.versionNo}`}
                  >
                    Download
                  </Button>
                  {!isCurrent && canWrite && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!v.wrappedKey || !name}
                      onClick={() => setRestoring(v)}
                      aria-label={`Restore v${v.versionNo}`}
                    >
                      Restore
                    </Button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {file && list.length > 1 && (
        <ChangeSummary fileId={file.id} mimeType={file.mimeType} before={list[1]} after={list[0]} />
      )}

      {file && name && downloading && (
        <DownloadPanel
          open
          onClose={() => setDownloading(null)}
          file={file}
          name={name}
          version={downloading}
        />
      )}

      {file && name && restoring && current && (
        <RestoreDialog
          file={file}
          name={name}
          version={restoring}
          latestNo={current.versionNo}
          onClose={() => setRestoring(null)}
        />
      )}

      {file && name && (
        <UploadPanel
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          vaultId={file.vaultId}
          vaultName={file.vaultName}
          existing={{ fileId: file.id, name }}
        />
      )}
    </>
  )
}

/*
  "What changed between the last two versions", worked out here after both are
  decrypted. The server only ever saw two different ciphertext digests.
*/
function ChangeSummary({
  fileId,
  mimeType,
  before,
  after,
}: {
  fileId: string
  mimeType: string
  before: VersionDto
  after: VersionDto
}) {
  const text = isTextLike(mimeType) && mimeType !== 'image/svg+xml'
  const a = usePlaintext(text && before.wrappedKey ? fileId : undefined, before.id)
  const b = usePlaintext(text && after.wrappedKey ? fileId : undefined, after.id)
  const [diff, setDiff] = useState<LineDiff | null>(null)

  useEffect(() => {
    if (!a.data || !b.data) return
    let alive = true
    Promise.all([a.data.blob.text(), b.data.blob.text()]).then(([x, y]) => {
      if (alive) setDiff(lineDiff(x, y))
    })
    return () => {
      alive = false
    }
  }, [a.data, b.data])

  const sizeDelta = after.sizeBytes - before.sizeBytes

  return (
    <section className={styles.summary} aria-label="Change summary">
      <p className={styles.summaryHead}>
        <span className={styles.delta}>Δ</span>
        <span className={styles.rule} aria-hidden />
        Change summary · v{before.versionNo} → v{after.versionNo}
      </p>
      <p className={styles.summarySub}>
        {text
          ? 'Computed in this browser after decryption'
          : 'Line counts are worked out for text files only, here just the sizes are compared'}
      </p>

      <div className={styles.stats}>
        {text && (
          <>
            <Stat value={diff ? `+${diff.added}` : '…'} label="lines added" tone="add" />
            <Stat value={diff ? `−${diff.removed}` : '…'} label="lines removed" tone="remove" />
            <Stat value={diff ? String(diff.unchanged) : '…'} label="lines unchanged" />
          </>
        )}
        <Stat
          value={`${sizeDelta >= 0 ? '+' : '−'}${formatBytes(Math.abs(sizeDelta))}`}
          label="size change"
        />
        {!text && (
          <Stat
            value={`${before.chunkCount} → ${after.chunkCount}`}
            label="chunks · fresh data key per version"
          />
        )}
      </div>
      {(a.isError || b.isError) && (
        <p className={styles.summaryErr}>One of the versions failed verification, so no summary.</p>
      )}
      <p className={styles.summaryFoot}>
        The server only ever compared ciphertext digests. It has no idea what changed.
      </p>
    </section>
  )
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: 'add' | 'remove' }) {
  return (
    <div className={styles.stat}>
      <span className={cx(styles.statValue, tone && styles[tone])}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}
