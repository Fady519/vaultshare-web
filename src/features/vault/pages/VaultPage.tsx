import { useEffect, useState, type DragEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Callout,
  EmptyState,
  FileRow,
  FileTable,
  Icon,
  Menu,
  Skeleton,
  SkeletonRows,
} from '@/components'
import { useVault } from '@/api/vaults'
import { useVaultFiles } from '@/api/files'
import type { FileDto } from '@/api/types'
import { useCrumbs } from '@/hooks/useCrumbs'
import { useSelection } from '@/hooks/useSelection'
import { formatDate, shortName, timeAgo } from '@/utils/format'
import { cx } from '@/utils/cx'
import { useFileNames } from '@/features/files/keys'
import { canPreview, cipherMeta } from '@/features/files/plaintext'
import { UploadPanel } from '@/features/files/components/UploadPanel'
import { DownloadPanel } from '@/features/files/components/DownloadPanel'
import { DropZone } from '@/features/files/components/DropZone'
import { RenameMoveDialog } from '@/features/files/components/RenameMoveDialog'
import { BulkDownloadPanel } from '@/features/files/components/BulkDownloadPanel'
import { toggleFavorite, trashWithUndo } from '@/features/files/actions'
import { ShareDialog } from '@/features/sharing/components/ShareDialog'
import { PendingGrants } from '@/features/sharing/components/PendingGrants'
import { BulkBar } from '../components/BulkBar'
import styles from './VaultPage.module.css'

export default function VaultPage() {
  const { vaultId } = useParams()
  const navigate = useNavigate()
  const vault = useVault(vaultId)
  const files = useVaultFiles(vaultId)
  const names = useFileNames(files.data?.items)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [dropped, setDropped] = useState<File[]>([])
  const [newVersionOf, setNewVersionOf] = useState<{ fileId: string; name: string } | null>(null)
  const [downloading, setDownloading] = useState<FileDto | null>(null)
  const [dragging, setDragging] = useState(false)
  const [moving, setMoving] = useState<{ file: FileDto; name: string }[] | null>(null)
  const [bulkDownload, setBulkDownload] = useState<{ file: FileDto; name: string }[] | null>(null)
  const [sharing, setSharing] = useState<{ file: FileDto; name: string }[] | null>(null)
  const items = files.data?.items ?? []
  const selection = useSelection(items.map((f) => f.id))

  // Esc clears the ticks, like a file manager
  useEffect(() => {
    if (selection.selected.size === 0) return
    const onKey = (e: KeyboardEvent) =>
      e.key === 'Escape' && !document.querySelector('dialog[open]') && selection.clear()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection])

  useCrumbs({ label: 'Vaults', to: '/vaults' }, vault.data?.name ?? '…')

  if (vault.isError) {
    return (
      <Callout tone="danger" title="This vault could not be opened">
        It may have been deleted, or you are no longer a member.
      </Callout>
    )
  }

  const v = vault.data
  const pending = v?.myStatus === 'pending'
  const canWrite = v ? v.role !== 'viewer' && !pending : false
  const canShare = v ? (v.role === 'owner' || v.role === 'manager') && !pending : false
  const nameOf = (f: FileDto) => names.data?.[f.id] ?? '…'
  const picked = items.filter((f) => selection.selected.has(f.id))
  const withNames = (list: FileDto[]) => list.map((file) => ({ file, name: nameOf(file) }))

  function openUpload(list: File[] = []) {
    setNewVersionOf(null)
    setDropped(list)
    setUploadOpen(true)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (!canWrite || uploadOpen) return
    const list = [...e.dataTransfer.files]
    if (list.length) openUpload(list)
  }

  return (
    <div
      className={cx(styles.page, dragging && styles.dragging)}
      onDragOver={(e) => {
        if (!canWrite || uploadOpen) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{v ? v.name : <Skeleton width={240} height={28} />}</h1>
          <p className={styles.meta}>
            {v
              ? `${v.fileCount} files  ·  AES-256-GCM  ·  ${v.memberCount} members  ·  created ${formatDate(v.createdAt)}` +
                (picked.length ? `  ·  ${picked.length} selected` : '')
              : ' '}
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="ghost" icon="users" to={`/vaults/${vaultId}/members`}>
            Members
          </Button>
          <Button
            icon="upload"
            disabled={!canWrite}
            title={canWrite ? undefined : 'Viewers can open files but not upload'}
            onClick={() => openUpload()}
          >
            Upload
          </Button>
        </div>
      </header>

      {pending && (
        <Callout
          tone="warn"
          icon="key"
          title="You're in, but your keys aren't here yet"
          className={styles.notice}
        >
          An owner or manager of {v?.name} has to wrap the vault's keys for your public key. That
          happens the next time one of them opens the vault; until then the files stay sealed for
          you.
        </Callout>
      )}
      {canShare && <PendingGrants vaultId={vaultId} />}

      {files.isPending && <SkeletonRows rows={6} />}

      {files.isError && (
        <Callout tone="danger" title="The file list could not be loaded">
          Try again in a moment.
        </Callout>
      )}

      {files.isSuccess && items.length === 0 && (
        <div className={styles.empty}>
          <EmptyState
            center
            icon="folder"
            title="This vault is empty"
            actions={
              canWrite && (
                <Button size="lg" onClick={() => openUpload()}>
                  Upload your first file
                </Button>
              )
            }
          >
            {canWrite
              ? 'Drop a file here and it is encrypted in your browser before the first byte is uploaded. Nothing readable ever reaches the server.'
              : 'Nothing has been uploaded yet. You are a viewer here, so files will show up when an editor adds them.'}
          </EmptyState>
          {canWrite && (
            <div className={styles.emptyDrop}>
              <DropZone onFiles={openUpload} />
            </div>
          )}
        </div>
      )}

      {picked.length > 0 && (
        <BulkBar
          count={picked.length}
          total={items.length}
          bytes={picked.reduce((n, f) => n + f.sizeBytes, 0)}
          keyCopies={picked.reduce((n, f) => n + f.people.length, 0)}
          canWrite={canWrite}
          canShare={canShare}
          onShare={() => setSharing(withNames(picked))}
          onToggleAll={selection.setAll}
          onMove={() => setMoving(withNames(picked))}
          onDownload={() => setBulkDownload(withNames(picked))}
          onDelete={() => {
            trashWithUndo(
              picked.map((f) => f.id),
              picked.length === 1 ? nameOf(picked[0]) : `${picked.length} files`,
            )
            selection.clear()
          }}
        />
      )}

      {items.length > 0 && (
        <>
          <FileTable
            selectable
            allSelected={picked.length === items.length}
            onSelectAll={selection.setAll}
          >
            {items.map((f) => {
              const name = nameOf(f)
              return (
                <FileRow
                  key={f.id}
                  name={name}
                  mimeType={f.mimeType}
                  meta={cipherMeta(f.currentVersion)}
                  version={`v${f.currentVersion.versionNo}`}
                  people={f.people}
                  when={timeAgo(f.updatedAt)}
                  who={shortName(f.updatedBy.displayName)}
                  favorite={f.isFavorite}
                  selected={selection.selected.has(f.id)}
                  onSelect={(on, shift) => selection.toggle(f.id, on, shift)}
                  onOpen={() => navigate(`/files/${f.id}`)}
                  actions={
                    <Menu
                      label={`Actions for ${name}`}
                      items={[
                        { label: 'Open', onSelect: () => navigate(`/files/${f.id}`) },
                        {
                          label: 'Preview',
                          onSelect: () => navigate(`/files/${f.id}/preview`),
                          disabled: !canPreview(f.mimeType),
                        },
                        { label: 'Download', onSelect: () => setDownloading(f) },
                        {
                          label: 'Share…',
                          disabled: !canShare,
                          hint: canShare ? undefined : 'Only owners and managers can share',
                          onSelect: () => setSharing([{ file: f, name }]),
                        },
                        { label: 'Versions', onSelect: () => navigate(`/files/${f.id}/versions`) },
                        {
                          label: 'Upload new version',
                          disabled: !canWrite,
                          onSelect: () => {
                            setDropped([])
                            setNewVersionOf({ fileId: f.id, name })
                            setUploadOpen(true)
                          },
                        },
                        {
                          label: 'Rename or move',
                          disabled: !canWrite,
                          onSelect: () => setMoving([{ file: f, name }]),
                        },
                        {
                          label: f.isFavorite ? 'Remove from favorites' : 'Add to favorites',
                          onSelect: () => toggleFavorite(f),
                        },
                        {
                          label: 'Move to trash',
                          danger: true,
                          disabled: !canWrite,
                          onSelect: () => trashWithUndo([f.id], name),
                        },
                      ]}
                    />
                  }
                />
              )
            })}
          </FileTable>
          <footer className={styles.foot}>
            <span>
              1–{items.length} of {files.data?.total ?? items.length}
            </span>
            <span>Every row is ciphertext at rest. File names are encrypted metadata.</span>
          </footer>
        </>
      )}

      {canWrite && (
        <button
          type="button"
          className={styles.fab}
          onClick={() => openUpload()}
          aria-label={`Upload files to ${v?.name ?? 'this vault'}`}
        >
          <Icon name="upload" size={20} />
        </button>
      )}

      {dragging && (
        <div className={styles.dropHint} aria-hidden>
          Drop to encrypt and upload to {v?.name}
        </div>
      )}

      {v && (
        <UploadPanel
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          vaultId={v.id}
          vaultName={v.name}
          initialFiles={dropped}
          existing={newVersionOf ?? undefined}
        />
      )}

      {moving && <RenameMoveDialog files={moving} onClose={() => setMoving(null)} />}
      {sharing && <ShareDialog files={sharing} onClose={() => setSharing(null)} />}

      {bulkDownload && (
        <BulkDownloadPanel files={bulkDownload} onClose={() => setBulkDownload(null)} />
      )}

      {downloading && (
        <DownloadPanel
          open
          onClose={() => setDownloading(null)}
          file={downloading}
          name={nameOf(downloading)}
        />
      )}
    </div>
  )
}
