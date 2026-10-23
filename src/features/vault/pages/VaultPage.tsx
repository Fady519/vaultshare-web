import { useState, type DragEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Callout,
  EmptyState,
  FileRow,
  FileTable,
  Menu,
  Skeleton,
  SkeletonRows,
} from '@/components'
import { useVault } from '@/api/vaults'
import { useVaultFiles } from '@/api/files'
import type { FileDto } from '@/api/types'
import { useCrumbs } from '@/hooks/useCrumbs'
import { formatDate, shortName, timeAgo } from '@/utils/format'
import { cx } from '@/utils/cx'
import { useFileNames } from '@/features/files/keys'
import { canPreview, cipherMeta } from '@/features/files/plaintext'
import { UploadPanel } from '@/features/files/components/UploadPanel'
import { DownloadPanel } from '@/features/files/components/DownloadPanel'
import { DropZone } from '@/features/files/components/DropZone'
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

  useCrumbs({ label: 'Vaults', to: '/vaults' }, vault.data?.name ?? '…')

  if (vault.isError) {
    return (
      <Callout tone="danger" title="This vault could not be opened">
        It may have been deleted, or you are no longer a member.
      </Callout>
    )
  }

  const v = vault.data
  const canWrite = v ? v.role !== 'viewer' : false
  const items = files.data?.items ?? []
  const nameOf = (f: FileDto) => names.data?.[f.id] ?? '…'

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
              ? `${v.fileCount} files  ·  AES-256-GCM  ·  ${v.memberCount} members  ·  created ${formatDate(v.createdAt)}`
              : ' '}
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="ghost" icon="share" disabled title="Sharing is not wired up yet">
            Share
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

      {files.isPending && <SkeletonRows rows={6} />}

      {files.isError && (
        <Callout tone="danger" title="The file list could not be loaded">
          Try again in a moment.
        </Callout>
      )}

      {files.isSuccess && items.length === 0 && (
        <div className={styles.empty}>
          <EmptyState
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

      {items.length > 0 && (
        <>
          <FileTable>
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
