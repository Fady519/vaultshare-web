import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Callout,
  Checkbox,
  HashBlock,
  Icon,
  SectionMark,
  TextField,
  toast,
} from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { authApi, keysApi } from '@/api/auth'
import { ApiError, errorMessage } from '@/api/client'
import { newRecoveryPhrase, passwordSecrets, runKeyCeremony, type CeremonyStep } from '@/crypto'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import { useSession } from '@/store/session'
import { downloadText } from '@/utils/download'
import { formatDate } from '@/utils/format'
import { CeremonySteps, type CeremonyStepRow } from '../components/CeremonySteps'
import { RecoveryWords } from '../components/RecoveryWords'
import { signOut, updateUser } from '../session'
import s from '../auth.module.css'
import styles from './KeyCeremonyPage.module.css'

const STEPS: Omit<CeremonyStepRow, 'state'>[] = [
  { label: 'Generate an RSA-4096 key pair', where: 'browser' },
  { label: 'Seal the private key with your password key · AES-256-GCM', where: 'browser' },
  { label: 'Seal a second copy with the recovery words · Argon2id', where: 'browser' },
  { label: 'Upload the public key and the two sealed blobs', where: 'server' },
]

const ORDER: CeremonyStep[] = ['keypair', 'seal', 'recovery', 'done']

export default function KeyCeremonyPage() {
  useDocumentTitle('Key ceremony')
  const navigate = useNavigate()
  const user = useSession((st) => st.user)
  const wrapKey = useSession((st) => st.wrapKey)

  // the 12 words are made once, here, and never sent anywhere
  const [words] = useState(newRecoveryPhrase)
  const [saved, setSaved] = useState(false)
  const [password, setPassword] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [rows, setRows] = useState<CeremonyStepRow[] | null>(null)
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const running = rows !== null && !fingerprint && !error

  // sealing with a key the server can't re-derive would lock the account forever,
  // so make sure the salts we derived with are still the account's salts
  useEffect(() => {
    const { wrapKey: key, wrapSalt } = useSession.getState()
    if (!key || !user) return
    authApi
      .prelogin(user.email)
      .then((pre) => {
        if (pre.saltWrap !== wrapSalt) useSession.getState().setWrapKey(null)
      })
      .catch(() => {})
  }, [user])

  // opened the email link in another tab: the wrap key from sign-up isn't in this tab
  async function confirmPassword(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setChecking(true)
    setPwError(null)
    try {
      const pre = await authApi.prelogin(user.email)
      const secrets = await passwordSecrets(password, pre.saltAuth, pre.saltWrap, pre.kdf)
      // the server confirms it's the same password by checking the verifier
      await authApi.login({ email: user.email, verifier: secrets.verifier, rememberDevice: false })
      useSession.getState().setWrapKey(secrets.wrapKey, pre.saltWrap)
      setPassword('')
    } catch (err) {
      setPwError(
        err instanceof ApiError && err.code === 'INVALID_CREDENTIALS'
          ? 'That is not the password you signed up with.'
          : errorMessage(err),
      )
    } finally {
      setChecking(false)
    }
  }

  function mark(index: number, state: CeremonyStepRow['state'], ms?: number) {
    setRows((prev) => prev && prev.map((r, i) => (i === index ? { ...r, state, ms } : r)))
  }

  async function generate() {
    if (!wrapKey || !user) return
    setError(null)
    setRows(STEPS.map((st, i) => ({ ...st, state: i === 0 ? 'running' : 'waiting' })))

    try {
      const keys = await runKeyCeremony(wrapKey, words, (step, ms) => {
        const i = ORDER.indexOf(step)
        if (i < 3) {
          mark(i, 'done', ms)
          mark(i + 1, 'running')
        }
      })

      const t = performance.now()
      await keysApi.setup({
        publicKey: keys.publicKey,
        sealedPrivateKey: keys.sealedPrivateKey,
        sealedRecoveryKey: keys.sealedRecoveryKey,
        keyVersion: 1,
      })
      mark(3, 'done', Math.round(performance.now() - t))

      // the private key stays in this tab only, non-extractable
      useSession.getState().unlock(keys.privateKey)
      setFingerprint(keys.fingerprint)
    } catch (err) {
      setRows(
        (prev) => prev && prev.map((r) => (r.state === 'running' ? { ...r, state: 'failed' } : r)),
      )
      setError(errorMessage(err))
    }
  }

  function download() {
    downloadText(
      'vaultshare-recovery-kit.txt',
      [
        'VaultShare recovery kit',
        `Account: ${user?.email}`,
        `Created: ${formatDate(new Date().toISOString())}`,
        '',
        ...words.map((w, i) => `${String(i + 1).padStart(2, '0')}  ${w}`),
        '',
        'These twelve words rebuild your private key if you forget your password.',
        'Print this file or keep it on another device, then delete it from this one.',
        'Nobody at VaultShare can recover your files without them.',
      ].join('\n'),
    )
  }

  async function copy() {
    await navigator.clipboard.writeText(words.join(' '))
    toast('Words copied. Paste them somewhere offline, then clear your clipboard.', 'warn')
  }

  // ---- finished ----
  if (fingerprint) {
    return (
      <StepCard
        step="Step 2 of 3"
        footer={
          <Button
            size="lg"
            className={s.footerEnd}
            onClick={() => {
              // the server already moved the account on; the guard follows the store
              if (user) updateUser({ ...user, status: 'pendingMfa', keyVersion: 1 })
              navigate('/setup/2fa')
            }}
          >
            Continue to second factor
          </Button>
        }
      >
        <SectionMark num="02">Key ceremony</SectionMark>
        <h1 className={s.title}>Your keys exist</h1>
        <p className={s.lead}>
          The server now holds your public key and two sealed blobs it cannot open. The private key
          is in this tab&apos;s memory only.
        </p>
        <CeremonySteps steps={rows ?? []} />
        <HashBlock label="Your public key fingerprint" value={fingerprint} />
        <p className={s.note}>
          People who share with you can compare this fingerprint with you over another channel to be
          sure they are encrypting to the right person.
        </p>
      </StepCard>
    )
  }

  return (
    <StepCard
      step="Step 2 of 3"
      footer={
        <>
          <Button
            variant="ghost"
            size="lg"
            disabled={running}
            onClick={async () => {
              await signOut()
              navigate('/signin')
            }}
          >
            Finish later
          </Button>
          <Button size="lg" loading={running} disabled={!wrapKey || !saved} onClick={generate}>
            Generate keys and continue
          </Button>
        </>
      }
    >
      <SectionMark num="02">Key ceremony</SectionMark>
      <h1 className={s.title}>Generate your key pair</h1>
      <p className={s.lead}>
        This happens entirely in your browser. The private key is encrypted with your password and
        never transmitted.
      </p>

      <div className={styles.cards}>
        <div className={styles.card}>
          <p className={styles.cardTitle}>
            <Icon name="shield" className={styles.pine} /> Public key
          </p>
          <p className={styles.cardText}>Stored on the server · shared with collaborators</p>
          <p className={styles.cardMeta}>RSA-4096 · SPKI</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardTitle}>
            <Icon name="key" className={styles.amber} /> Private key
          </p>
          <p className={styles.cardText}>Wrapped with Argon2id · never leaves this device</p>
          <p className={`${styles.cardMeta} ${styles.amber}`}>AES-256-GCM wrapped</p>
        </div>
      </div>

      {wrapKey ? (
        <Callout tone="ok" icon="check">
          Wrapping key ready — derived from your password at sign-up (Argon2id, m=64 MiB, t=3, p=4).
        </Callout>
      ) : (
        <form className={styles.password} onSubmit={confirmPassword}>
          <TextField
            label="Unlock password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={pwError ?? undefined}
            hint="Derives your wrapping key with Argon2id (m=64 MiB, t=3, p=4)."
          />
          <Button type="submit" variant="soft" loading={checking} disabled={!password}>
            Derive key
          </Button>
        </form>
      )}

      {rows ? (
        <CeremonySteps steps={rows} />
      ) : (
        <>
          <div className={s.stack}>
            <div>
              <p className={s.label}>Recovery kit</p>
              <p className={styles.kitText}>
                Twelve words that reconstruct your private key. Print it. Store it offline.
              </p>
            </div>
            <RecoveryWords words={words} />
            <div className={s.row}>
              <Button variant="ghost" icon="down" onClick={download}>
                Download recovery kit
              </Button>
              <Button variant="ghost" onClick={copy}>
                Copy words
              </Button>
            </div>
          </div>
          <Callout tone="warn">
            If you lose this kit and your password, your files stay encrypted forever. There is no
            reset — that is the point.
          </Callout>
          <Checkbox
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            label="I have stored these twelve words somewhere I can reach without this device."
          />
        </>
      )}

      {error && (
        <Callout tone="danger" title="The ceremony stopped">
          {error} Nothing usable was stored — you can run it again.
        </Callout>
      )}
    </StepCard>
  )
}
