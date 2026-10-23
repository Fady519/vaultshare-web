import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Callout, Modal, SectionMark, TextField, toast } from '@/components'
import { ApiError, errorMessage } from '@/api/client'
import { lookupUser } from '@/api/me'
import { shareKeys, sharingApi } from '@/api/sharing'
import { vaultKeys } from '@/api/vaults'
import type { UserLookupDto, VaultRole } from '@/api/types'
import { cx } from '@/utils/cx'
import { completeGrant } from '../engine'
import styles from './InviteDialog.module.css'

const ROLES: { value: VaultRole; label: string; what: string }[] = [
  { value: 'viewer', label: 'Viewer', what: 'decrypt and read' },
  { value: 'editor', label: 'Editor', what: 'decrypt, edit, commit versions, move and delete' },
  { value: 'manager', label: 'Manager', what: 'everything, plus sharing and members' },
]

type Props = {
  vaultId: string
  vaultName: string
  fileCount: number
  // only the owner may invite managers
  isOwner: boolean
  onClose: () => void
}

// figma 42. an invitation is a queued key exchange
export function InviteDialog({ vaultId, vaultName, fileCount, isOwner, onClose }: Props) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<VaultRole>('editor')
  const [message, setMessage] = useState('')
  const [known, setKnown] = useState<UserLookupDto | null | undefined>(undefined)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  // look the address up as it's typed, to say which of the two paths it takes
  useEffect(() => {
    const value = email.trim().toLowerCase()
    setKnown(undefined)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return
    const t = setTimeout(() => {
      lookupUser(value)
        .then(setKnown)
        .catch((err) =>
          setKnown(err instanceof ApiError && err.code === 'USER_NOT_FOUND' ? null : undefined),
        )
    }, 350)
    return () => clearTimeout(t)
  }, [email])

  async function send(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter an email address.')
    setBusy('Sending')
    try {
      await sharingApi.invite(vaultId, {
        email: email.trim(),
        role,
        message: message.trim() || undefined,
      })
      if (known) {
        // they already have keys: wrap the vault's keys for them right now
        const grants = await sharingApi.pendingGrants()
        const grant = grants.find(
          (g) => g.vaultId === vaultId && g.recipient.userId === known.userId,
        )
        if (grant) {
          await completeGrant(grant, (n) =>
            setBusy(`Wrapping key ${n} of ${grant.versions.length}`),
          )
          toast(`${known.displayName} is in. ${grant.versions.length} keys wrapped for them.`, 'ok')
        }
      } else {
        toast(`Invitation sent to ${email.trim()}.`, 'ok')
      }
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
      qc.invalidateQueries({ queryKey: vaultKeys.all })
      qc.invalidateQueries({ queryKey: shareKeys.invitations(vaultId) })
      qc.invalidateQueries({ queryKey: shareKeys.grants })
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissable={!busy}
      width={640}
      title={`Invite to ${vaultName}`}
      subtitle="an invitation is a queued key exchange"
      footer={
        <>
          {busy && <span className={styles.busy}>{busy}…</span>}
          <Button variant="ghost" onClick={onClose} disabled={Boolean(busy)}>
            Cancel
          </Button>
          <Button type="submit" form="invite" loading={Boolean(busy)}>
            {known ? 'Add and wrap keys' : 'Send invitation'}
          </Button>
        </>
      }
    >
      <form id="invite" className={styles.form} onSubmit={send}>
        <TextField
          label="Email"
          type="email"
          mono
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
        />

        <SectionMark num="01">{`Role in ${vaultName}`}</SectionMark>
        <div className={styles.roles} role="radiogroup" aria-label="Role">
          {ROLES.filter((r) => isOwner || r.value !== 'manager').map((r) => (
            <label key={r.value} className={cx(styles.role, role === r.value && styles.on)}>
              <input
                type="radio"
                name="role"
                value={r.value}
                checked={role === r.value}
                onChange={() => setRole(r.value)}
              />
              <span className={styles.roleName}>{r.label}</span>
              <span className={styles.roleWhat}>{r.what}</span>
            </label>
          ))}
        </div>

        {known && (
          <Callout tone="ok" icon="key" title={`${known.displayName} already has a public key`}>
            The keys of the {fileCount} files in this vault are wrapped for them as soon as you send
            this. Key fingerprint {known.fingerprint.split(' ').slice(0, 4).join(' ')} — check it
            with them if you can.
          </Callout>
        )}
        {known === null && (
          <Callout tone="warn" icon="key" title="Access starts as pending">
            {email.trim()} has no VaultShare account yet. The invitation is stored, and the data
            keys in this vault are wrapped the moment their key ceremony completes and someone who
            can manage the vault opens it.
          </Callout>
        )}

        <TextField
          label="Message (optional)"
          value={message}
          maxLength={300}
          onChange={(e) => setMessage(e.target.value)}
          hint="Goes in the email. The email itself carries no key material."
        />

        {error && (
          <Callout tone="danger" title="Not sent">
            {error}
          </Callout>
        )}
      </form>
    </Modal>
  )
}
