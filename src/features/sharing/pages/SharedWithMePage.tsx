import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Avatar,
  Callout,
  EmptyState,
  FileKindBox,
  Menu,
  PageHead,
  SkeletonRows,
  Tag,
} from '@/components'
import { useIncomingShares } from '@/api/sharing'
import type { FileDto } from '@/api/types'
import { useCrumbs } from '@/hooks/useCrumbs'
import { cx } from '@/utils/cx'
import { formatDate, timeAgo } from '@/utils/format'
import { useFileNames } from '@/features/files/keys'
import { canPreview, cipherMeta } from '@/features/files/plaintext'
import { DownloadPanel } from '@/features/files/components/DownloadPanel'
import { expiresWithinWeek, expiryLevel } from '../expiry'
import styles from './SharedPages.module.css'

// figma 17
export default function SharedWithMePage() {
  useCrumbs('Shared with me')
  const navigate = useNavigate()
  const incoming = useIncomingShares()
  const list = incoming.data ?? []
  const names = useFileNames(list.map((s) => s.file))
  const [downloading, setDownloading] = useState<FileDto | null>(null)

  const soon = list.filter((s) => expiresWithinWeek(s.expiresAt)).length

  return (
    <>
      <PageHead
        title="Shared with me"
        meta={
          incoming.data
            ? `${list.length} file${list.length === 1 ? '' : 's'}  ·  each data key wrapped to your public key  ·  ${soon} expiring within 7 days`
            : ' '
        }
      />

      {incoming.isPending && <SkeletonRows rows={5} />}
      {incoming.isError && (
        <Callout tone="danger" title="Shared files could not be loaded">
          Try again in a moment.
        </Callout>
      )}
      {incoming.isSuccess && list.length === 0 && (
        <EmptyState icon="users" title="Nothing shared with you yet">
          When someone shares a single file with you from a vault you're not in, it lands here —
          with its key already wrapped to your public key.
        </EmptyState>
      )}

      {list.length > 0 && (
        <div
          role="table"
          aria-label="Shared with me"
          className={cx(styles.table, 'stack-rows with-menu')}
        >
          <div role="row" className={cx(styles.row, styles.withMe, styles.head)}>
            <span role="columnheader">File</span>
            <span role="columnheader">Shared by</span>
            <span role="columnheader">Your role</span>
            <span role="columnheader">Access expires</span>
            <span role="columnheader">Shared</span>
            <span role="columnheader" aria-label="Actions" />
          </div>
          {list.map((s) => {
            const name = names.data?.[s.file.id] ?? '…'
            return (
              <div key={s.file.id} role="row" className={cx(styles.row, styles.withMe)}>
                <span role="cell" className={styles.file}>
                  <FileKindBox mimeType={s.file.mimeType} name={name} />
                  <span className={styles.names}>
                    <button type="button" onClick={() => navigate(`/files/${s.file.id}`)}>
                      {name}
                    </button>
                    <span>
                      {cipherMeta(s.file.currentVersion)} · from {s.file.vaultName}
                    </span>
                  </span>
                </span>
                <span role="cell" className={styles.person}>
                  <Avatar name={s.sharedBy.displayName} size={24} />
                  {s.sharedBy.displayName}
                </span>
                <span role="cell">
                  <Tag tone={s.role === 'editor' ? 'accent' : 'neutral'}>{s.role}</Tag>
                </span>
                <span role="cell" className={cx(styles.expiry, styles[expiryLevel(s.expiresAt)])}>
                  <span className={styles.dot} aria-hidden />
                  {s.expiresAt ? formatDate(s.expiresAt) : 'No expiry'}
                </span>
                <span role="cell" className={styles.mono}>
                  {timeAgo(s.sharedAt)}
                </span>
                <span role="cell" className={styles.actions}>
                  <Menu
                    label={`Actions for ${name}`}
                    items={[
                      { label: 'Open', onSelect: () => navigate(`/files/${s.file.id}`) },
                      {
                        label: 'Preview',
                        disabled: !canPreview(s.file.mimeType),
                        onSelect: () => navigate(`/files/${s.file.id}/preview`),
                      },
                      { label: 'Download', onSelect: () => setDownloading(s.file) },
                      {
                        label: 'Versions',
                        onSelect: () => navigate(`/files/${s.file.id}/versions`),
                      },
                    ]}
                  />
                </span>
              </div>
            )
          })}
        </div>
      )}

      {list.length > 0 && (
        <p className={styles.note}>
          You hold a wrapped copy of each data key. If the owner revokes your access, that copy is
          deleted — the ciphertext stays where it is.
        </p>
      )}

      {downloading && (
        <DownloadPanel
          open
          onClose={() => setDownloading(null)}
          file={downloading}
          name={names.data?.[downloading.id] ?? 'file'}
        />
      )}
    </>
  )
}
