import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Callout, Modal, ProgressBar, toast } from '@/components'
import { fileKeys } from '@/api/files'
import { vaultKeys } from '@/api/vaults'
import { errorMessage } from '@/api/client'
import type { FileDto, VersionDto } from '@/api/types'
import { decryptVersion, type DownloadProgress } from '../download'
import { uploadFile, type UploadProgress } from '../upload'
import { StepList, type Step } from './StepList'
import styles from './RestoreDialog.module.css'

type Props = {
  file: FileDto
  name: string
  version: VersionDto
  latestNo: number
  onClose: () => void
}

/*
  Restoring never rewrites history: the old version is decrypted here and
  uploaded again as a brand new version, with a fresh data key, wrapped for
  whoever is in the vault today.
*/
export function RestoreDialog({ file, name, version, latestNo, onClose }: Props) {
  const qc = useQueryClient()
  const [down, setDown] = useState<DownloadProgress | null>(null)
  const [up, setUp] = useState<UploadProgress | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const next = latestNo + 1

  async function restore() {
    setRunning(true)
    setError('')
    try {
      const { blob } = await decryptVersion(file.id, version.id, setDown)
      await uploadFile({
        vaultId: file.vaultId,
        data: blob,
        name,
        mimeType: file.mimeType,
        fileId: file.id,
        note: `Restored from v${version.versionNo}`,
        onProgress: setUp,
      })
      qc.invalidateQueries({ queryKey: fileKeys.one(file.id) })
      qc.invalidateQueries({ queryKey: fileKeys.versions(file.id) })
      qc.invalidateQueries({ queryKey: fileKeys.vault(file.vaultId) })
      qc.invalidateQueries({ queryKey: vaultKeys.all })
      toast(`v${version.versionNo} restored as v${next}.`, 'ok')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setRunning(false)
    }
  }

  const steps: Step[] = [
    {
      label: `Decrypt and verify v${version.versionNo}`,
      detail: down ? `${down.chunk} of ${down.chunkCount || '…'} chunks` : undefined,
      state: up ? 'done' : running ? 'active' : 'todo',
    },
    {
      label: 'Encrypt again under a fresh data key',
      state: !up ? 'todo' : up.stage === 'prepare' || up.stage === 'encrypt' ? 'active' : 'done',
    },
    {
      label: `Wrap it for ${up?.recipients.length || 'every'} member key${up?.recipients.length === 1 ? '' : 's'}`,
      state:
        !up || ['prepare', 'encrypt'].includes(up.stage)
          ? 'todo'
          : up.stage === 'wrap'
            ? 'active'
            : 'done',
    },
    {
      label: `Commit as v${next}`,
      state: up?.stage === 'done' ? 'done' : up?.stage === 'commit' ? 'active' : 'todo',
    },
  ]
  if (error) {
    const i = steps.findIndex((s) => s.state === 'active')
    if (i >= 0) steps[i].state = 'failed'
  }

  const ratio = up
    ? 0.5 + (up.bytesDone / Math.max(1, version.sizeBytes)) * 0.5
    : down?.chunkCount
      ? (down.chunk / down.chunkCount) * 0.5
      : 0

  return (
    <Modal
      open
      onClose={onClose}
      dismissable={!running}
      width={600}
      title={`Restore v${version.versionNo}`}
      subtitle="decrypted here, encrypted again under a new key"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button icon="restore" loading={running} onClick={restore}>
            Restore as v{next}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <p className={styles.lead}>
          v{version.versionNo} becomes v{next}. Nothing is deleted — v{latestNo} stays in the
          history and can be restored the same way.
        </p>
        {(running || error) && <ProgressBar value={ratio} label="Restore progress" />}
        <StepList steps={steps} />
        {error && (
          <Callout tone="danger" title="Not restored">
            {error}
          </Callout>
        )}
      </div>
    </Modal>
  )
}
