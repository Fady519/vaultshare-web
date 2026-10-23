import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Avatar,
  Button,
  Callout,
  DataCell,
  EmptyState,
  Menu,
  PageHead,
  SectionMark,
  Skeleton,
  Tag,
} from '@/components'
import { useFileDetail } from '@/api/files'
import { useVault } from '@/api/vaults'
import type { AuditAction, FileAccessEntry } from '@/api/types'
import { fromBase64, IntegrityError, toHex } from '@/crypto'
import { useCrumbs } from '@/hooks/useCrumbs'
import { useSession } from '@/store/session'
import { formatBytes, shortHash, timeAgo } from '@/utils/format'
import { errorMessage } from '@/api/client'
import { useFileName } from '../keys'
import { canPreview, digestHex, usePlaintext } from '../plaintext'
import { DownloadPanel } from '../components/DownloadPanel'
import { FilePreview } from '../components/FilePreview'
import { MockTamper } from '../components/MockTamper'
import { RenameMoveDialog } from '../components/RenameMoveDialog'
import { toggleFavorite, trashWithUndo } from '../actions'
import styles from './FileDetailPage.module.css'

// bigger files are only decrypted for a preview when asked to
const AUTO_PREVIEW_BYTES = 25 * 1024 * 1024

const ACTIVITY: Partial<Record<AuditAction, string>> = {
  'file.upload': 'uploaded the first version',
  'file.version': 'committed a new version',
  'file.download': 'downloaded and decrypted',
  'file.rename': 'renamed it',
  'file.trash': 'moved it to trash',
  'file.restore': 'restored it from trash',
  'share.grant': 'shared it',
  'share.revoke': 'revoked a share',
  'link.create': 'created a link',
}

export default function FileDetailPage() {
  const { fileId } = useParams()
  const me = useSession((s) => s.user)
  const detail = useFileDetail(fileId)
  const file = detail.data?.file
  const name = useFileName(file)
  const [asked, setAsked] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [moving, setMoving] = useState(false)
  const navigate = useNavigate()
  const vault = useVault(detail.data?.file.vaultId)
  const canWrite = vault.data ? vault.data.role !== 'viewer' : false

  const previewable = file ? canPreview(file.mimeType) : false
  const auto = file ? file.sizeBytes <= AUTO_PREVIEW_BYTES : false
  const plain = usePlaintext(
    previewable && (auto || asked) ? file?.id : undefined,
    file?.currentVersion.id,
  )

  useCrumbs(
    { label: 'Vaults', to: '/vaults' },
    file ? { label: file.vaultName, to: `/vaults/${file.vaultId}` } : '…',
    name ?? '…',
  )

  if (detail.isError) {
    return (
      <Callout tone="danger" title="This file could not be opened">
        It may have been deleted, or you no longer have access to it.
      </Callout>
    )
  }

  const v = file?.currentVersion
  const firstChunk = plain.data?.info.chunks[0]
  const integrity = plain.error instanceof IntegrityError ? plain.error : null

  return (
    <>
      <PageHead
        title={name}
        meta={
          v
            ? `decrypted in this tab  ·  ${formatBytes(v.sizeBytes)}  ·  v${v.versionNo}  ·  sha256 ${shortHash(digestHex(v.digest))}`
            : ' '
        }
        actions={
          <>
            <Button variant="ghost" icon="share" disabled title="Sharing is not wired up yet">
              Share
            </Button>
            <Button variant="ghost" icon="clock" to={`/files/${fileId}/versions`}>
              Versions
            </Button>
            <Button icon="down" disabled={!file || !name} onClick={() => setDownloading(true)}>
              Download
            </Button>
            {file && name && (
              <Menu
                label={`More for ${name}`}
                items={[
                  {
                    label: file.isFavorite ? 'Remove from favorites' : 'Add to favorites',
                    onSelect: () => toggleFavorite(file),
                  },
                  { label: 'Rename or move', disabled: !canWrite, onSelect: () => setMoving(true) },
                  {
                    label: 'Move to trash',
                    danger: true,
                    disabled: !canWrite,
                    onSelect: () => {
                      trashWithUndo([file.id], name)
                      navigate(`/vaults/${file.vaultId}`)
                    },
                  },
                ]}
              />
            )}
          </>
        }
      />

      <div className={styles.layout}>
        <section className={styles.preview} aria-label="Preview">
          {!file || (previewable && (auto || asked) && plain.isPending) ? (
            <div className={styles.decrypting}>
              <Skeleton width="60%" height={14} />
              <Skeleton width="40%" height={10} />
              <p>Decrypting in this tab…</p>
            </div>
          ) : !previewable ? (
            <EmptyState icon="eye" title="No preview for this type">
              {file.mimeType || 'This format'} can't be shown in the browser. Download it, it is
              decrypted and verified the same way.
            </EmptyState>
          ) : !auto && !asked ? (
            <EmptyState
              icon="lock"
              title="Large file"
              actions={<Button onClick={() => setAsked(true)}>Decrypt and preview</Button>}
            >
              {formatBytes(file.sizeBytes)} would be decrypted into this tab's memory first.
            </EmptyState>
          ) : plain.isError ? (
            <div className={styles.withheld}>
              <p className={styles.withheldTitle}>Preview withheld</p>
              <p>Nothing from this version was rendered because it did not pass verification.</p>
            </div>
          ) : (
            <>
              <FilePreview
                blob={plain.data!.blob}
                mimeType={file.mimeType}
                name={name ?? 'file'}
                compact
              />
              <p className={styles.caption}>Rendered from plaintext held only in this tab</p>
            </>
          )}
        </section>

        <aside className={styles.side}>
          <SectionMark num="01">Encryption</SectionMark>
          <dl className={styles.cells}>
            <DataCell label="Cipher">AES-256-GCM</DataCell>
            <DataCell label="IV · chunk 1">
              {firstChunk ? toHex(fromBase64(firstChunk.iv)) : '—'}
            </DataCell>
            <DataCell label="Auth tag · chunk 1">
              {firstChunk ? toHex(fromBase64(firstChunk.tag)) : '—'}
            </DataCell>
            <DataCell label="Data key">
              {detail.data ? `256-bit · wrapped ×${detail.data.wrappedKeyCount}` : '…'}
            </DataCell>
            <DataCell label="Wrapping">RSA-4096 OAEP · SHA-256</DataCell>
          </dl>

          <SectionMark num="02">Who holds a key</SectionMark>
          <ul className={styles.people}>
            {detail.data?.access.map((a) => (
              <li key={a.userId} className={styles.person}>
                <Avatar name={a.displayName} size={28} />
                <div className={styles.who}>
                  <p>{a.displayName}</p>
                  <span>{holderNote(a, me?.id)}</span>
                </div>
                <Tag tone={!a.hasKey ? 'warn' : a.role === 'owner' ? 'accent' : 'neutral'}>
                  {a.hasKey ? a.role : 'pending'}
                </Tag>
              </li>
            ))}
            {detail.isPending && <Skeleton height={28} />}
          </ul>

          <SectionMark num="03">Integrity</SectionMark>
          {integrity ? (
            <Callout tone="danger" title={`Chunk ${integrity.index + 1} failed verification`}>
              {integrity.message}. The stored object no longer matches what was uploaded.
            </Callout>
          ) : plain.isError ? (
            <Callout tone="danger" title="Could not decrypt">
              {errorMessage(plain.error)}
            </Callout>
          ) : plain.isSuccess ? (
            <Callout tone="ok" icon="check" title="GCM tag verified on decrypt">
              Any single flipped bit in storage or transit would have failed this check before a
              byte was rendered.
            </Callout>
          ) : (
            <Callout tone="info" title="Checked on every decrypt">
              Each chunk's digest and GCM tag are verified when you preview or download it.
            </Callout>
          )}

          {v && <MockTamper versionId={v.id} />}

          <SectionMark num="04">Recent activity</SectionMark>
          <ul className={styles.activity}>
            {detail.data?.recentActivity.map((e) => (
              <li key={e.seq}>
                <span>
                  {e.actorName ?? 'System'} {ACTIVITY[e.action] ?? e.action}
                </span>
                <time dateTime={e.timestamp}>{timeAgo(e.timestamp)}</time>
              </li>
            ))}
            {detail.data?.recentActivity.length === 0 && <li>Nothing yet.</li>}
          </ul>
        </aside>
      </div>

      {file && name && downloading && (
        <DownloadPanel open onClose={() => setDownloading(false)} file={file} name={name} />
      )}
      {file && name && moving && (
        <RenameMoveDialog files={[{ file, name }]} onClose={() => setMoving(false)} />
      )}
    </>
  )
}

function holderNote(a: FileAccessEntry, meId: string | undefined) {
  if (a.userId === meId) return 'You'
  if (!a.hasKey) return 'Awaiting key exchange'
  return a.source === 'share' ? 'Shared · key wrapped' : 'Key wrapped'
}
