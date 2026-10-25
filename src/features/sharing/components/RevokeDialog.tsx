import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Callout, Checkbox, Icon, Modal, ProgressBar, toast } from '@/components'
import { errorMessage } from '@/api/client'
import { fileKeys } from '@/api/files'
import { sharingApi } from '@/api/sharing'
import { vaultKeys } from '@/api/vaults'
import { rekeyVersions, type RekeyProgress, type RekeyTarget } from '@/features/files/rekey'
import styles from './RevokeDialog.module.css'

type Person = { userId: string; displayName: string }

type Props = { title: string; onClose: () => void } & (
  | { mode: 'share'; fileId: string; people: Person[] }
  | { mode: 'member'; vaultId: string; vaultName: string; people: Person[] }
)

/*
  Revoking deletes the person's wrapped key copies. That's honest but not the
  whole story, so the dialog says what it does and what it can't do, and
  offers to rotate: re-encrypt the affected versions under new keys.
*/
export function RevokeDialog(props: Props) {
  const qc = useQueryClient()
  const [rotate, setRotate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<RekeyProgress | null>(null)
  const [error, setError] = useState('')
  const names = props.people.map((p) => p.displayName).join(', ')

  async function revoke() {
    setBusy(true)
    setError('')
    const affected: RekeyTarget[] = []
    try {
      for (const p of props.people) {
        const res =
          props.mode === 'share'
            ? await sharingApi.revokeShare(props.fileId, p.userId)
            : await sharingApi.removeMember(props.vaultId, p.userId)
        affected.push(...res.affectedVersions)
      }
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
      refresh()
      return
    }

    if (rotate && affected.length) {
      try {
        await rekeyVersions(affected, setProgress)
      } catch (err) {
        setError(
          `Access is revoked, but rotating stopped: ${errorMessage(err)}. The versions not rotated keep their old key.`,
        )
        setBusy(false)
        refresh()
        return
      }
    }

    toast(
      rotate && affected.length
        ? `${names} revoked. ${affected.length} version${affected.length === 1 ? '' : 's'} re-encrypted under new keys.`
        : `${names} revoked. Their key copies are deleted.`,
      'ok',
    )
    refresh()
    props.onClose()
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ['shares'] })
    qc.invalidateQueries({ queryKey: fileKeys.all })
    qc.invalidateQueries({ queryKey: vaultKeys.all })
  }

  return (
    <Modal
      open
      onClose={props.onClose}
      dismissable={!busy}
      width={640}
      title={props.title}
      subtitle="revoking deletes the key copy, not the file"
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={revoke}>
            {rotate ? 'Revoke and rotate keys' : 'Revoke'}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <div className={styles.cols}>
          <div>
            <p className={styles.head}>What happens</p>
            <ul className={styles.list}>
              <li>
                <Icon name="check" size={14} />
                {props.mode === 'share'
                  ? `${names}'s wrapped key for every version of this file is deleted now`
                  : `${names}'s wrapped keys for every file in ${props.vaultName} are deleted now`}
              </li>
              <li>
                <Icon name="check" size={14} />
                The server stops handing out the file to them, and the app can't unwrap it for them
                any more
              </li>
              <li>
                <Icon name="check" size={14} />
                It is written to the audit chain
              </li>
            </ul>
          </div>
          <div>
            <p className={styles.head}>What it can't do</p>
            <ul className={styles.list}>
              <li className={styles.no}>
                <span aria-hidden>—</span>
                Un-read anything they already opened, downloaded or saved
              </li>
              <li className={styles.no}>
                <span aria-hidden>—</span>
                Without rotation, make a key they copied out of their browser useless: the stored
                ciphertext is still under that key
              </li>
            </ul>
          </div>
        </div>

        <div className={styles.rotate}>
          <Checkbox
            checked={rotate}
            disabled={busy}
            onChange={(e) => setRotate(e.target.checked)}
            label="Also rotate the keys"
            sub="Every affected version is decrypted here and encrypted again under a fresh key, wrapped only for the people who keep access. Secure links to those versions stop working."
          />
        </div>

        {progress && (
          <div className={styles.progress}>
            <p role="status">
              Rotating {progress.current ? `${progress.current} · ` : ''}
              {progress.done} of {progress.total} versions
            </p>
            <ProgressBar
              value={progress.done / Math.max(1, progress.total)}
              label="Rotation progress"
            />
          </div>
        )}

        {error && (
          <Callout tone="danger" title="Something went wrong">
            {error}
          </Callout>
        )}
      </div>
    </Modal>
  )
}
