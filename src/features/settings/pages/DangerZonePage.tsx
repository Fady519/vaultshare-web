import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Callout, Modal, ProgressBar, Select, TextField, toast } from '@/components'
import { errorMessage } from '@/api/client'
import { filesApi, useTrash } from '@/api/files'
import { sharingApi, useOutgoingShares } from '@/api/sharing'
import { settingsApi } from '@/api/settings'
import { useVaults } from '@/api/vaults'
import { useSession } from '@/store/session'
import { cx } from '@/utils/cx'
import { signOut } from '@/features/auth/session'
import { rekeyVersions, type RekeyProgress } from '@/features/files/rekey'
import { PurgeDialog } from '@/features/files/components/PurgeDialog'
import { KeyDialog } from '../components/KeyDialogs'
import { SettingsLayout } from '../SettingsLayout'
import styles from './DangerZonePage.module.css'

function Item({
  tone,
  title,
  children,
  action,
}: {
  tone: 'warn' | 'danger'
  title: string
  children: ReactNode
  action: ReactNode
}) {
  return (
    <section className={cx(styles.item, styles[tone])}>
      <div className={styles.text}>
        <h2>{title}</h2>
        <div className={styles.body}>{children}</div>
      </div>
      <div className={styles.action}>{action}</div>
    </section>
  )
}

// figma 49. every one of these is written to the audit chain
export default function DangerZonePage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const user = useSession((s) => s.user)
  const vaults = useVaults()
  const outgoing = useOutgoingShares()
  const trash = useTrash()
  const managed = (vaults.data ?? []).filter((v) => v.role === 'owner' || v.role === 'manager')
  const [vaultId, setVaultId] = useState('')
  const [dialog, setDialog] = useState<'rotate-vault' | 'empty' | 'reset' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)

  const role = new Map((vaults.data ?? []).map((v) => [v.id, v.role]))
  const purgeable = (trash.data ?? []).filter((f) =>
    ['owner', 'manager'].includes(role.get(f.vaultId) ?? ''),
  )
  const shares = outgoing.data ?? []
  const chosen = managed.find((v) => v.id === (vaultId || managed[0]?.id))

  async function revokeAll() {
    setBusy(true)
    let done = 0
    try {
      for (const sh of shares) {
        await sharingApi.revokeShare(sh.file.id, sh.recipient.id)
        done++
      }
      toast(`${done} wrapped key copies deleted.`, 'ok')
    } catch (err) {
      toast(`${errorMessage(err)} (${done} revoked before that)`, 'danger')
    } finally {
      setBusy(false)
      qc.invalidateQueries({ queryKey: ['shares'] })
    }
  }

  return (
    <SettingsLayout
      title="Danger zone"
      crumb="Danger zone"
      meta="irreversible operations  ·  every one of them is hash-chained in the audit log"
    >
      <Item
        tone="warn"
        title="Rotate every data key in a vault"
        action={
          <div className={styles.inline}>
            <Select
              compact
              aria-label="Vault"
              options={managed.map((v) => ({ value: v.id, label: v.name }))}
              value={chosen?.id ?? ''}
              onChange={(e) => setVaultId(e.target.value)}
            />
            <Button variant="ghost" disabled={!chosen} onClick={() => setDialog('rotate-vault')}>
              Rotate
            </Button>
          </div>
        }
      >
        Re-encrypts every version of every file in{' '}
        {chosen
          ? `${chosen.name} (${chosen.fileCount} files, ${chosen.memberCount} members)`
          : 'a vault you manage'}{' '}
        under fresh keys, in this tab. Do it after removing someone who might have kept keys. Secure
        links to those files stop working.
      </Item>

      <Item
        tone="warn"
        title="Revoke all my direct shares"
        action={
          <Button variant="ghost" loading={busy} disabled={!shares.length} onClick={revokeAll}>
            Revoke all
          </Button>
        }
      >
        Deletes the {shares.length} wrapped key {shares.length === 1 ? 'copy' : 'copies'} you handed
        to people outside the vaults. Vault members keep theirs.
      </Item>

      <Item
        tone="danger"
        title="Empty the trash permanently"
        action={
          <Button variant="danger" disabled={!purgeable.length} onClick={() => setDialog('empty')}>
            Empty trash
          </Button>
        }
      >
        {purgeable.length} file{purgeable.length === 1 ? '' : 's'} in vaults you manage, with every
        version and key copy, are erased. There is no backup that brings them back.
      </Item>

      <Item
        tone="danger"
        title="Reset my private key"
        action={
          <Button variant="danger" onClick={() => setDialog('reset')}>
            Reset key
          </Button>
        }
      >
        Every file wrapped only to your old key becomes unreadable, including by you, until someone
        re-shares it.
      </Item>

      <Item
        tone="danger"
        title="Delete my account"
        action={
          <Button variant="danger" onClick={() => setDialog('delete')}>
            Delete account
          </Button>
        }
      >
        Removes your key copies from {vaults.data?.length ?? 0} vaults and signs you out everywhere.
        Vaults only you were in are deleted with their files; vaults you own with other members have
        to be handed over first.
      </Item>

      {dialog === 'rotate-vault' && chosen && (
        <RotateVaultDialog
          vaultId={chosen.id}
          vaultName={chosen.name}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'empty' && (
        <PurgeDialog mode="all" files={purgeable} onClose={() => setDialog(null)} />
      )}
      {dialog === 'reset' && <KeyDialog kind="reset" onClose={() => setDialog(null)} />}
      {dialog === 'delete' && user && (
        <DeleteAccountDialog
          email={user.email}
          onClose={() => setDialog(null)}
          onDeleted={async () => {
            await signOut()
            navigate('/')
          }}
        />
      )}
    </SettingsLayout>
  )
}

function RotateVaultDialog({
  vaultId,
  vaultName,
  onClose,
}: {
  vaultId: string
  vaultName: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [progress, setProgress] = useState<RekeyProgress | null>(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)

  async function run() {
    setRunning(true)
    setError('')
    try {
      const files = [
        ...(await filesApi.list(vaultId, 'active')).items,
        ...(await filesApi.list(vaultId, 'trashed')).items,
      ]
      const targets = []
      for (const f of files) {
        for (const v of await filesApi.versions(f.id))
          targets.push({ fileId: f.id, versionId: v.id })
      }
      await rekeyVersions(targets, setProgress)
      toast(`${targets.length} versions in ${vaultName} re-encrypted under new keys.`, 'ok')
      qc.invalidateQueries()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setRunning(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissable={!running}
      width={600}
      title={`Rotate every key in ${vaultName}`}
      subtitle="decrypt, re-encrypt under fresh keys, re-wrap for today's members"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button loading={running} onClick={run}>
            Rotate keys
          </Button>
        </>
      }
    >
      <div className={styles.dialog}>
        <p>
          Every version is downloaded, checked, decrypted and encrypted again in this tab, then
          uploaded next to the old bytes and swapped in. It can take a while for big vaults; keep
          this tab open.
        </p>
        {progress && (
          <>
            <p className={styles.progressText}>
              {progress.done} of {progress.total} versions
              {progress.current ? ` · now ${progress.current}` : ''}
            </p>
            <ProgressBar value={progress.done / Math.max(1, progress.total)} label="Rotation" />
          </>
        )}
        {error && (
          <Callout tone="danger" title="Stopped">
            {error}. Versions already rotated stay rotated.
          </Callout>
        )}
      </div>
    </Modal>
  )
}

function DeleteAccountDialog({
  email,
  onClose,
  onDeleted,
}: {
  email: string
  onClose: () => void
  onDeleted: () => void
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    setBusy(true)
    setError('')
    try {
      await settingsApi.deleteAccount(typed)
      toast('Your account is deleted.', 'ok')
      onDeleted()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissable={!busy}
      width={600}
      title="Delete my account"
      subtitle="there is no recovery path after this"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Keep my account
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={typed.trim().toLowerCase() !== email.toLowerCase()}
            onClick={remove}
          >
            Delete account
          </Button>
        </>
      }
    >
      <div className={styles.dialog}>
        <Callout tone="danger" title="Your keys are destroyed">
          Your private key, recovery kit, second factors and every wrapped key copy are deleted.
          What others shared with you is gone for you; what you shared stays with them. The audit
          log keeps its record.
        </Callout>
        <TextField
          label="Type your email to confirm"
          mono
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          error={error || undefined}
          placeholder={email}
        />
      </div>
    </Modal>
  )
}
