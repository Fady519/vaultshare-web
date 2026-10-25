import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Button, EmptyState, PageHead, Skeleton } from '@/components'
import { useFileDetail, useFileVersions } from '@/api/files'
import { fromBase64, IntegrityError, toHex } from '@/crypto'
import { useCrumbs } from '@/hooks/useCrumbs'
import { cx } from '@/utils/cx'
import { formatBytes } from '@/utils/format'
import { useFileName } from '../keys'
import { canPreview, usePlaintext } from '../plaintext'
import { DownloadPanel } from '../components/DownloadPanel'
import { FilePreview } from '../components/FilePreview'
import { ShareDialog } from '@/features/sharing/components/ShareDialog'
import { fileAccess } from '../access'
import styles from './FilePreviewPage.module.css'
import { LoadError } from '@/features/errors/LoadError'
import { DecryptRefused } from '../components/DecryptRefused'

// figma 36. ?v=<versionId> previews an older version from the history page
export default function FilePreviewPage() {
  const { fileId } = useParams()
  const [params] = useSearchParams()
  const detail = useFileDetail(fileId)
  const versions = useFileVersions(params.get('v') ? fileId : undefined)
  const file = detail.data?.file
  const name = useFileName(file)
  const [downloading, setDownloading] = useState(false)
  const [sharing, setSharing] = useState(false)

  const version =
    versions.data?.find((v) => v.id === params.get('v')) ??
    (params.get('v') ? undefined : file?.currentVersion)
  const previewable = file ? canPreview(file.mimeType) : false
  const plain = usePlaintext(previewable ? file?.id : undefined, version?.id)
  const old = version && file && version.id !== file.currentVersion.id

  const access = fileAccess(detail.data)
  useCrumbs(
    ...(access.viaShare ? [] : [{ label: 'Vaults', to: '/vaults' }]),
    access.crumb,
    name ? { label: name, to: `/files/${fileId}` } : '…',
    old ? `Preview v${version.versionNo}` : 'Preview',
  )

  if (detail.isError) {
    return <LoadError error={detail.error} thing="file" onRetry={() => detail.refetch()} />
  }

  const info = plain.data?.info
  const integrity = plain.error instanceof IntegrityError ? plain.error : null

  return (
    <>
      <PageHead
        title={name}
        meta={
          version
            ? `decrypted in this tab  ·  v${version.versionNo}${old ? ' (older version)' : ''}  ·  ${formatBytes(version.sizeBytes)}  ·  never cached to disk`
            : ' '
        }
        actions={
          <>
            <Button icon="down" disabled={!name || !version} onClick={() => setDownloading(true)}>
              Download
            </Button>
            <Button
              variant="ghost"
              disabled={!access.canShare || !name}
              title={
                access.canShare ? undefined : 'Only owners and managers of the vault can share'
              }
              onClick={() => setSharing(true)}
            >
              Share
            </Button>
            <Button variant="ghost" to={`/files/${fileId}/versions`}>
              Versions
            </Button>
          </>
        }
      />

      <div className={styles.layout}>
        <section aria-label="Preview">
          {file && !previewable ? (
            <EmptyState icon="eye" title="No preview for this type">
              {file.mimeType} can't be shown in the browser. Download it instead, it is verified the
              same way.
            </EmptyState>
          ) : plain.isError ? (
            <div className={styles.withheld}>
              <DecryptRefused
                error={plain.error}
                chunkCount={version?.chunkCount ?? 1}
                onRetry={() => plain.refetch()}
              />
            </div>
          ) : plain.data && file ? (
            <FilePreview blob={plain.data.blob} mimeType={file.mimeType} name={name ?? 'file'} />
          ) : (
            <div className={styles.decrypting}>
              <Skeleton width="55%" height={14} />
              <Skeleton width="35%" height={10} />
              <p>Decrypting in this tab…</p>
            </div>
          )}
          <p className={styles.under}>
            <span>{version ? `v${version.versionNo} · ${file?.mimeType}` : ''}</span>
            <span>fit width</span>
          </p>
        </section>

        <aside className={styles.side}>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Decryption</h2>
            <p
              className={cx(
                styles.status,
                plain.isError && styles.bad,
                plain.isPending && styles.wait,
              )}
            >
              <span className={styles.dot} aria-hidden />
              {plain.isSuccess
                ? 'verified · tag matched'
                : plain.isError
                  ? 'rejected · nothing rendered'
                  : 'decrypting…'}
            </p>
            <dl className={styles.rows}>
              <div>
                <dt>Cipher</dt>
                <dd>AES-256-GCM</dd>
              </div>
              <div>
                <dt>Chunks</dt>
                <dd>
                  {info
                    ? `${info.chunkCount} of ${info.chunkCount} decrypted`
                    : integrity
                      ? `failed at ${integrity.index + 1}`
                      : '…'}
                </dd>
              </div>
              <div>
                <dt>Key source</dt>
                <dd className={styles.accent}>wrapped for you</dd>
              </div>
              <div>
                <dt>IV · chunk 1</dt>
                <dd className={styles.faint}>
                  {info ? toHex(fromBase64(info.chunks[0].iv)) : '…'}
                </dd>
              </div>
              <div>
                <dt>Held in</dt>
                <dd className={styles.warn}>memory only</dd>
              </div>
            </dl>
          </div>
          <p className={styles.note}>
            The preview is rendered from plaintext that exists only in this tab's memory. Locking
            the vault or closing the tab destroys it.
          </p>
        </aside>
      </div>

      {file && name && sharing && (
        <ShareDialog files={[{ file, name }]} onClose={() => setSharing(false)} />
      )}
      {file && name && version && downloading && (
        <DownloadPanel
          open
          onClose={() => setDownloading(false)}
          file={file}
          name={name}
          version={version}
        />
      )}
    </>
  )
}
