import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Avatar,
  Button,
  Callout,
  Modal,
  SectionMark,
  Select,
  Tag,
  TextField,
  toast,
} from '@/components'
import { ApiError, errorMessage } from '@/api/client'
import { fileKeys, useFileDetail } from '@/api/files'
import { lookupUser } from '@/api/me'
import { shareKeys, sharingApi, useFileShares, useMyLinks } from '@/api/sharing'
import type { FileDto, FileShareDto, ShareRole, UserLookupDto } from '@/api/types'
import { useSession } from '@/store/session'
import { formatDate, timeAgo } from '@/utils/format'
import { shareFile } from '../engine'
import { RevokeDialog } from './RevokeDialog'
import { SecureLinkDialog } from './SecureLinkDialog'
import styles from './ShareDialog.module.css'

type Props = {
  // one file shows who has access; several just add the same people to all of them
  files: { file: FileDto; name: string }[]
  onClose: () => void
}

type Adding = { person: UserLookupDto; role: ShareRole }

const SHARE_ROLES = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
]

const EXPIRY = [
  { value: '0', label: 'No expiry' },
  { value: '7', label: 'Expires in 7 days' },
  { value: '30', label: 'Expires in 30 days' },
  { value: '90', label: 'Expires in 90 days' },
]

// "9ed6 34fe 1a2b 77c0" -> what people read out to each other on the phone
const shortPrint = (fp: string) => fp.split(' ').slice(0, 4).join(' ')

// figma 14
export function ShareDialog({ files, onClose }: Props) {
  const qc = useQueryClient()
  const me = useSession((s) => s.user)
  const single = files.length === 1 ? files[0] : null
  const detail = useFileDetail(single?.file.id)
  const shares = useFileShares(single?.file.id)
  const links = useMyLinks()

  const [email, setEmail] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [looking, setLooking] = useState(false)
  const [adding, setAdding] = useState<Adding[]>([])
  const [expiry, setExpiry] = useState('0')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [revoking, setRevoking] = useState<FileShareDto | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)

  const access = detail.data?.access ?? []
  const hasAccess = (userId: string) =>
    access.some((a) => a.userId === userId) || adding.some((a) => a.person.userId === userId)

  async function add() {
    const value = email.trim().toLowerCase()
    setLookupError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return setLookupError('Enter an email address.')
    setLooking(true)
    try {
      const person = await lookupUser(value)
      if (person.userId === me?.id) setLookupError('That is you.')
      else if (hasAccess(person.userId)) setLookupError(`${person.displayName} already has access.`)
      else {
        setAdding((list) => [...list, { person, role: 'viewer' }])
        setEmail('')
      }
    } catch (err) {
      setLookupError(
        err instanceof ApiError && err.code === 'USER_NOT_FOUND'
          ? 'No VaultShare account uses this email. Invite them to the vault from Members instead.'
          : errorMessage(err),
      )
    } finally {
      setLooking(false)
    }
  }

  async function save() {
    setError('')
    const expiresAt =
      expiry === '0' ? null : new Date(Date.now() + Number(expiry) * 86_400_000).toISOString()
    let done = 0
    try {
      for (const { file, name } of files) {
        for (const a of adding) {
          setBusy(`Re-wrapping keys of ${name} for ${a.person.displayName}`)
          await shareFile(file, a.person, a.role, expiresAt)
          done++
        }
      }
      toast(
        files.length === 1
          ? `Shared with ${adding.map((a) => a.person.displayName).join(', ')}.`
          : `${files.length} files shared.`,
        'ok',
      )
      onClose()
    } catch (err) {
      setError(
        `${errorMessage(err)}${done ? ` (${done} share${done === 1 ? '' : 's'} went through before that.)` : ''}`,
      )
    } finally {
      setBusy(null)
      qc.invalidateQueries({ queryKey: ['shares'] })
      qc.invalidateQueries({ queryKey: fileKeys.all })
    }
  }

  async function changeRole(s: FileShareDto, role: ShareRole) {
    try {
      await sharingApi.changeShare(single!.file.id, s.userId, role)
      toast(`${s.displayName} is now ${role === 'viewer' ? 'a viewer' : 'an editor'}.`, 'ok')
    } catch (err) {
      toast(errorMessage(err), 'danger')
    } finally {
      qc.invalidateQueries({ queryKey: shareKeys.file(single!.file.id) })
    }
  }

  const fileLinks = (links.data ?? []).filter(
    (l) =>
      single && l.fileId === single.file.id && !l.revoked && l.expiresAt > new Date().toISOString(),
  )

  return (
    <>
      <Modal
        open={!revoking && !linkOpen}
        onClose={onClose}
        dismissable={!busy}
        width={720}
        title={single ? `Share ${single.name}` : `Share ${files.length} files`}
        subtitle="Each recipient gets the data key re-wrapped to their own public key."
        footer={
          <>
            {busy && <span className={styles.busy}>{busy}…</span>}
            <Button variant="ghost" onClick={onClose} disabled={Boolean(busy)}>
              {adding.length ? 'Cancel' : 'Close'}
            </Button>
            <Button disabled={!adding.length} loading={Boolean(busy)} onClick={save}>
              Save and re-wrap keys
            </Button>
          </>
        }
      >
        <div className={styles.body}>
          <div className={styles.add}>
            <TextField
              label="Add people by email"
              type="email"
              placeholder="name@company.com"
              value={email}
              error={lookupError}
              autoFocus
              onChange={(e) => {
                setEmail(e.target.value)
                setLookupError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  add()
                }
              }}
            />
            <Button variant="ghost" icon="plus" loading={looking} onClick={add}>
              Add
            </Button>
          </div>

          {adding.length > 0 && (
            <>
              <ul className={styles.people}>
                {adding.map((a) => (
                  <li key={a.person.userId} className={styles.person}>
                    <Avatar name={a.person.displayName} size={28} />
                    <div className={styles.who}>
                      <p>{a.person.displayName}</p>
                      <span>
                        key {shortPrint(a.person.fingerprint)} · compare it with them before saving
                      </span>
                    </div>
                    <Select
                      compact
                      aria-label={`Role for ${a.person.displayName}`}
                      options={SHARE_ROLES}
                      value={a.role}
                      onChange={(e) =>
                        setAdding((list) =>
                          list.map((x) =>
                            x === a ? { ...x, role: e.target.value as ShareRole } : x,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`Don't add ${a.person.displayName}`}
                      onClick={() => setAdding((list) => list.filter((x) => x !== a))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <Select
                label="Access for the new people"
                options={EXPIRY}
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </>
          )}

          {single && (
            <>
              <SectionMark>People with access</SectionMark>
              <ul className={styles.people}>
                {access
                  .filter((a) => a.source === 'vault')
                  .map((a) => (
                    <li key={a.userId} className={styles.person}>
                      <Avatar name={a.displayName} size={28} />
                      <div className={styles.who}>
                        <p>{a.displayName}</p>
                        <span className={a.hasKey ? undefined : styles.pending}>
                          {a.userId === me?.id
                            ? 'You'
                            : a.hasKey
                              ? 'Vault member · key wrapped'
                              : 'Awaiting key exchange'}
                        </span>
                      </div>
                      <Tag tone={a.role === 'owner' ? 'accent' : 'neutral'}>{a.role}</Tag>
                    </li>
                  ))}
                {(shares.data ?? []).map((s) => (
                  <li key={s.userId} className={styles.person}>
                    <Avatar name={s.displayName} size={28} />
                    <div className={styles.who}>
                      <p>{s.displayName}</p>
                      <span>
                        Shared by {s.sharedBy.displayName} {timeAgo(s.sharedAt).toLowerCase()} ·{' '}
                        {s.expiresAt ? `expires ${formatDate(s.expiresAt)}` : 'no expiry'}
                      </span>
                    </div>
                    <Select
                      compact
                      aria-label={`Role for ${s.displayName}`}
                      options={SHARE_ROLES}
                      value={s.role}
                      onChange={(e) => changeRole(s, e.target.value as ShareRole)}
                    />
                    <Button variant="ghost" size="sm" onClick={() => setRevoking(s)}>
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
              <p className={styles.hint}>
                Vault members are managed on the vault's{' '}
                <Link to={`/vaults/${single.file.vaultId}/members`} onClick={onClose}>
                  Members
                </Link>{' '}
                page. Here you share this one file with someone outside it.
              </p>

              <SectionMark>Secure link</SectionMark>
              {fileLinks.map((l) => (
                <p key={l.id} className={styles.linkRow}>
                  <span>
                    Link created {timeAgo(l.createdAt).toLowerCase()} · {l.downloads}
                    {l.maxDownloads ? ` of ${l.maxDownloads}` : ''} opens · expires{' '}
                    {formatDate(l.expiresAt)}
                    {l.hasPassphrase ? ' · passphrase' : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await sharingApi.revokeLink(l.id)
                        toast('Link revoked. Its key copy is gone.', 'ok')
                      } catch (err) {
                        toast(errorMessage(err), 'danger')
                      } finally {
                        qc.invalidateQueries({ queryKey: shareKeys.links })
                      }
                    }}
                  >
                    Revoke
                  </Button>
                </p>
              ))}
              <div className={styles.linkRow}>
                <span>
                  A link opens this version for anyone holding it, no account needed. The key lives
                  after the # and never reaches the server.
                </span>
                <Button variant="ghost" size="sm" icon="share" onClick={() => setLinkOpen(true)}>
                  Create a link
                </Button>
              </div>
            </>
          )}

          {!single && (
            <p className={styles.hint}>
              The people you add get their own wrapped key for every version of all {files.length}{' '}
              files.
            </p>
          )}

          {error && (
            <Callout tone="danger" title="Not everything was shared">
              {error}
            </Callout>
          )}
        </div>
      </Modal>

      {revoking && single && (
        <RevokeDialog
          mode="share"
          fileId={single.file.id}
          title={`Revoke ${revoking.displayName}'s access`}
          people={[{ userId: revoking.userId, displayName: revoking.displayName }]}
          onClose={() => setRevoking(null)}
        />
      )}
      {linkOpen && single && (
        <SecureLinkDialog
          file={single.file}
          name={single.name}
          onClose={() => setLinkOpen(false)}
        />
      )}
    </>
  )
}
