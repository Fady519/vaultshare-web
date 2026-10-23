import { useState, type FormEvent } from 'react'
import { Button, Callout, Icon, Modal, SectionMark, TextField, toast } from '@/components'
import { useVaults } from '@/api/vaults'
import { errorMessage } from '@/api/client'
import type { FileDto } from '@/api/types'
import { cx } from '@/utils/cx'
import { moveFile, refreshFiles, renameFile } from '../actions'
import styles from './RenameMoveDialog.module.css'

type Props = {
  // one file: rename and/or move. several: move only
  files: { file: FileDto; name: string }[]
  onClose: () => void
}

// figma 38
export function RenameMoveDialog({ files, onClose }: Props) {
  const single = files.length === 1 ? files[0] : null
  const sourceVault = files[0].file.vaultId
  const vaults = useVaults()
  const [name, setName] = useState(single?.name ?? '')
  const [target, setTarget] = useState(sourceVault)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const writable = (vaults.data ?? []).filter((v) => v.role !== 'viewer')
  const moving = target !== sourceVault
  const renaming = single !== null && name.trim() !== single.name

  async function apply(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (single && !name.trim()) return setError('The file needs a name.')
    if (!moving && !renaming) return onClose()

    try {
      if (single && renaming) {
        setBusy('Sealing the new name')
        await renameFile(single.file, name)
      }
      if (moving) {
        for (const [i, f] of files.entries()) {
          setBusy(`Re-wrapping keys · ${i + 1} of ${files.length}`)
          await moveFile(f.file, target)
        }
      }
      const where = writable.find((v) => v.id === target)?.name
      toast(
        moving
          ? `${single ? (renaming ? name.trim() : single.name) : `${files.length} files`} moved to ${where}.`
          : 'Renamed.',
        'ok',
      )
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
      refreshFiles()
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissable={!busy}
      width={660}
      title={single ? 'Rename or move' : `Move ${files.length} files`}
      subtitle="metadata is ciphertext, so both are re-encrypts"
      footer={
        <>
          {busy && <span className={styles.busy}>{busy}…</span>}
          <Button variant="ghost" onClick={onClose} disabled={Boolean(busy)}>
            Cancel
          </Button>
          <Button type="submit" form="rename-move" loading={Boolean(busy)}>
            Apply
          </Button>
        </>
      }
    >
      <form id="rename-move" className={styles.form} onSubmit={apply}>
        {single && (
          <TextField
            label="File name (encrypted metadata)"
            value={name}
            maxLength={255}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            hint="The name is ciphertext too. Renaming re-encrypts the metadata blob."
          />
        )}

        <SectionMark num="01">Move to vault</SectionMark>
        <div className={styles.vaults} role="radiogroup" aria-label="Vault">
          {writable.map((v) => (
            <label key={v.id} className={cx(styles.vault, v.id === target && styles.on)}>
              <input
                type="radio"
                name="vault"
                value={v.id}
                checked={v.id === target}
                onChange={() => setTarget(v.id)}
              />
              <Icon name="folder" />
              <span className={styles.vaultName}>{v.name}</span>
              <span className={styles.count}>
                {v.id === sourceVault ? 'current · ' : ''}
                {v.fileCount} files
              </span>
            </label>
          ))}
        </div>

        {moving && (
          <p className={styles.warn}>
            Moving between vaults re-wraps every data key to the destination member set. Members who
            lose access lose their key copy.
          </p>
        )}
        {error && (
          <Callout tone="danger" title="Nothing was changed">
            {error}
          </Callout>
        )}
      </form>
    </Modal>
  )
}
