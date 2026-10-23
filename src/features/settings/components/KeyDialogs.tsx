import { useState, type FormEvent } from 'react'
import { Button, Callout, Checkbox, Modal, ProgressBar, TextField, toast } from '@/components'
import { api, ApiError, errorMessage } from '@/api/client'
import { authApi } from '@/api/auth'
import { queryClient } from '@/api/queryClient'
import { settingsApi } from '@/api/settings'
import type { UserDto } from '@/api/types'
import {
  DecryptError,
  newRecoveryKit,
  newRecoveryPhrase,
  resetKeyPair,
  rotateKeyPair,
} from '@/crypto'
import { useSession } from '@/store/session'
import { RecoveryWords } from '@/features/auth/components/RecoveryWords'
import { updateUser } from '@/features/auth/session'
import styles from './KeyDialogs.module.css'

type Kind = 'rotate' | 'kit' | 'reset'

const TEXT: Record<Kind, { title: string; subtitle: string; button: string }> = {
  rotate: {
    title: 'Rotate your key pair',
    subtitle: 'new key pair, every data key re-wrapped, new recovery kit',
    button: 'Rotate keys',
  },
  kit: {
    title: 'Make a new recovery kit',
    subtitle: 'twelve new words for the same key',
    button: 'Make the kit',
  },
  reset: {
    title: 'Reset your private key',
    subtitle: 'a new key pair, nothing carried over',
    button: 'Reset my key',
  },
}

/*
  The three operations that need the private key itself, not just the
  non-extractable copy in memory: the current password opens the sealed copy
  in this tab. After a rotation or reset the new key replaces the old one in
  memory, and every cached list is refetched (it still points at old wrapped keys).
*/
export function KeyDialog({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const user = useSession((s) => s.user)
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ words: string[]; fingerprint?: string } | null>(null)
  const [stored, setStored] = useState(false)
  const t = TEXT[kind]

  async function run(e: FormEvent) {
    e.preventDefault()
    if (!user || !password) return
    if (kind === 'reset' && confirmText !== 'reset my key') return
    setError('')
    setBusy('Checking your password')
    try {
      const [salts, keys] = await Promise.all([authApi.prelogin(user.email), settingsApi.myKeys()])
      const words = newRecoveryPhrase()

      if (kind === 'kit') {
        const sealed = await newRecoveryKit(password, salts, keys.sealedPrivateKey, words)
        setBusy('Saving the kit')
        await settingsApi.newRecoveryKit(sealed)
        setResult({ words })
      } else if (kind === 'rotate') {
        const wrapped = await settingsApi.myWrappedKeys()
        setProgress({ done: 0, total: wrapped.length })
        setBusy('Generating RSA-4096 and re-wrapping')
        const next = await rotateKeyPair(
          useSession.getState().privateKey!,
          password,
          salts,
          keys.sealedPrivateKey,
          words,
          wrapped,
          (done) => setProgress({ done, total: wrapped.length }),
        )
        setBusy('Saving')
        await settingsApi.rotateKeys({
          publicKey: next.publicKey,
          sealedPrivateKey: next.sealedPrivateKey,
          sealedRecoveryKey: next.sealedRecoveryKey,
          keyVersion: user.keyVersion + 1,
          rewrapped: next.rewrapped,
        })
        swapKey(next.privateKey)
        setResult({ words, fingerprint: next.fingerprint })
      } else {
        setBusy('Generating a new key pair')
        const next = await resetKeyPair(password, salts, keys.sealedPrivateKey, words)
        setBusy('Saving')
        await settingsApi.resetKeys({
          publicKey: next.publicKey,
          sealedPrivateKey: next.sealedPrivateKey,
          sealedRecoveryKey: next.sealedRecoveryKey,
          keyVersion: user.keyVersion + 1,
        })
        swapKey(next.privateKey)
        setResult({ words, fingerprint: next.fingerprint })
      }
    } catch (err) {
      setError(
        err instanceof DecryptError ||
          (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS')
          ? 'That is not your password.'
          : errorMessage(err),
      )
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  if (result) {
    return (
      <Modal
        open
        onClose={() => stored && onClose()}
        dismissable={false}
        width={680}
        title="Your new recovery kit"
        subtitle={
          result.fingerprint
            ? `new key fingerprint ${result.fingerprint}`
            : 'the old words stopped working'
        }
        footer={
          <Button disabled={!stored} onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className={styles.body}>
          <RecoveryWords words={result.words} />
          <Callout tone="warn" title="Write these down now">
            This is the only time they are shown. They are the one way back to your files if you
            forget your password.
          </Callout>
          <Checkbox
            checked={stored}
            onChange={(e) => setStored(e.target.checked)}
            label="I have stored these twelve words"
          />
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissable={!busy}
      width={620}
      title={t.title}
      subtitle={t.subtitle}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={Boolean(busy)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="key-dialog"
            variant={kind === 'reset' ? 'danger' : 'primary'}
            loading={Boolean(busy)}
            disabled={!password || (kind === 'reset' && confirmText !== 'reset my key')}
          >
            {t.button}
          </Button>
        </>
      }
    >
      <form id="key-dialog" className={styles.body} onSubmit={run}>
        {kind === 'rotate' && (
          <p className={styles.lead}>
            A new RSA-4096 key pair is made in this tab. Every data key you hold is unwrapped with
            the old private key and wrapped again to the new public key — the files themselves
            aren't re-encrypted, so this takes seconds. You get new recovery words; the old ones
            would only open the retired key.
          </p>
        )}
        {kind === 'kit' && (
          <p className={styles.lead}>
            Your private key is opened with your password and sealed again under twelve new words.
            The old words stop working as soon as this is saved.
          </p>
        )}
        {kind === 'reset' && (
          <Callout
            tone="danger"
            title="Files wrapped only to your old key become unreadable, by you too"
          >
            Use this only if you believe your private key itself is compromised. Your vault
            memberships go back to "pending" until an owner or manager wraps the keys for your new
            key, and files shared with you directly are lost.
          </Callout>
        )}
        <TextField
          label="Your password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="Opens the sealed private key here. It is not sent."
        />
        {kind === 'reset' && (
          <TextField
            label='Type "reset my key" to confirm'
            mono
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
        )}
        {busy && <p className={styles.busy}>{busy}…</p>}
        {progress && progress.total > 0 && (
          <ProgressBar value={progress.done / progress.total} label="Re-wrapping data keys" />
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

function swapKey(privateKey: CryptoKey) {
  // the new key in memory; every cached file, name and version points at the old wrapped keys
  useSession.getState().unlock(privateKey)
  queryClient.removeQueries({ queryKey: ['names'] })
  queryClient.removeQueries({ queryKey: ['notes'] })
  queryClient.removeQueries({ queryKey: ['plaintext'] })
  queryClient.invalidateQueries()
  // keyVersion moved on: the next rotation must ask for version + 1 again
  api
    .get<UserDto>('/me')
    .then(updateUser)
    .catch(() => {})
  toast('Key pair replaced. Write down the new recovery words.', 'ok')
}
