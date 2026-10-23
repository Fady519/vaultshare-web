import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Callout,
  Checkbox,
  Modal,
  SectionMark,
  Select,
  TextField,
  toast,
} from '@/components'
import { errorMessage } from '@/api/client'
import { shareKeys, sharingApi } from '@/api/sharing'
import type { FileDto, LinkDto } from '@/api/types'
import { formatDate } from '@/utils/format'
import { createSecureLink } from '../engine'
import styles from './SecureLinkDialog.module.css'

const EXPIRY = [
  { value: '1', label: '1 day' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
]

type Props = { file: FileDto; name: string; onClose: () => void }

// figma 41
export function SecureLinkDialog({ file, name, onClose }: Props) {
  const qc = useQueryClient()
  const [days, setDays] = useState('30')
  const [requireSignIn, setRequireSignIn] = useState(false)
  const [limit, setLimit] = useState(false)
  const [maxOpens, setMaxOpens] = useState('25')
  const [allowDownload, setAllowDownload] = useState(true)
  const [usePassphrase, setUsePassphrase] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ link: LinkDto; url: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function create(e: FormEvent) {
    e.preventDefault()
    if (usePassphrase && passphrase.trim().length < 8) {
      return setError('Use at least 8 characters for the passphrase.')
    }
    setBusy(true)
    setError('')
    try {
      const res = await createSecureLink(file, name, {
        expiresInDays: Number(days),
        maxDownloads: limit ? Math.max(1, Number(maxOpens) || 1) : 0,
        requireSignIn,
        allowDownload,
        passphrase: usePassphrase ? passphrase.trim() : undefined,
      })
      setCreated(res)
      qc.invalidateQueries({ queryKey: shareKeys.links })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(created!.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function revoke() {
    setBusy(true)
    try {
      await sharingApi.revokeLink(created!.link.id)
      toast('Link revoked. Its key copy is gone.', 'ok')
      qc.invalidateQueries({ queryKey: shareKeys.links })
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const [base, fragment] = created ? created.url.split('#') : ['', '']

  return (
    <Modal
      open
      onClose={onClose}
      dismissable={!busy}
      width={660}
      title="Secure link"
      subtitle="share without an account, without giving up the key"
      footer={
        created ? (
          <>
            <Button variant="danger" loading={busy} onClick={revoke}>
              Revoke link
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="secure-link" loading={busy}>
              Create link
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className={styles.body}>
          <SectionMark num="01">Link</SectionMark>
          <div className={styles.url}>
            <code>
              {base}
              <span className={styles.fragment}>#{fragment}</span>
            </code>
            <Button variant="ghost" size="sm" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <Callout tone="warn" title="This is the only time the full link is shown">
            The key after # isn't stored anywhere, not even here. If it gets lost, revoke this link
            and make a new one.
          </Callout>
          <p className={styles.meta}>
            {name} · v{file.currentVersion.versionNo} · expires {formatDate(created.link.expiresAt)}
            {created.link.maxDownloads ? ` · ${created.link.maxDownloads} opens` : ''}
            {created.link.hasPassphrase ? ' · passphrase needed' : ''}
            {created.link.requireSignIn ? ' · sign-in needed' : ''}
          </p>
        </div>
      ) : (
        <form id="secure-link" className={styles.body} onSubmit={create}>
          <p className={styles.lead}>
            The link points at v{file.currentVersion.versionNo} of {name}. A new 256-bit key is made
            in this tab and goes after the # in the link; browsers never send that part to a server,
            so what VaultShare stores for the link can't open the file on its own.
          </p>

          <SectionMark num="01">Conditions</SectionMark>
          <Select
            label="Expires after"
            options={EXPIRY}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <Checkbox
            checked={requireSignIn}
            onChange={(e) => setRequireSignIn(e.target.checked)}
            label="Require a VaultShare sign-in"
            sub="the link alone is not enough"
          />
          <Checkbox
            checked={limit}
            onChange={(e) => setLimit(e.target.checked)}
            label="Limit the number of opens"
            sub="the counter is kept by the server"
          />
          {limit && (
            <TextField
              label="Opens"
              type="number"
              min={1}
              max={1000}
              value={maxOpens}
              onChange={(e) => setMaxOpens(e.target.value)}
            />
          )}
          <Checkbox
            checked={allowDownload}
            onChange={(e) => setAllowDownload(e.target.checked)}
            label="Allow saving the file"
            sub="when off the page only previews it; someone determined can still keep what they see"
          />
          <Checkbox
            checked={usePassphrase}
            onChange={(e) => setUsePassphrase(e.target.checked)}
            label="Ask for a passphrase too"
            sub="send it another way; the link alone then opens nothing"
          />
          {usePassphrase && (
            <TextField
              label="Passphrase"
              type="text"
              autoComplete="off"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              hint="Stretched with Argon2id in the viewer's browser, never sent anywhere."
            />
          )}

          {error && (
            <Callout tone="danger" title="No link was made">
              {error}
            </Callout>
          )}
          <p className={styles.meta}>
            Revoking a link deletes its sealed key copy. Anyone holding the URL then holds a pointer
            to bytes they cannot open.
          </p>
        </form>
      )}
    </Modal>
  )
}
