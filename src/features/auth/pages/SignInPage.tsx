import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Callout, Checkbox, Icon, SectionMark, TextField } from '@/components'
import { AuthSplit } from '@/layouts/AuthSplit/AuthSplit'
import { authApi } from '@/api/auth'
import { ApiError, errorMessage } from '@/api/client'
import { passwordSecrets } from '@/crypto'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import { useSession } from '@/store/session'
import { AuthAside } from '../components/AuthAside'
import { safeNext, setPendingEmail, startSession, unlockWith } from '../session'
import s from '../auth.module.css'

export default function SignInPage() {
  useDocumentTitle('Sign in')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const expired = useSession((st) => st.expired)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setBusy(true)
    setError(null)
    try {
      const pre = await authApi.prelogin(email.trim())
      const secrets = await passwordSecrets(password, pre.saltAuth, pre.saltWrap, pre.kdf)
      const res = await authApi.login({
        email: email.trim(),
        verifier: secrets.verifier,
        rememberDevice: remember,
      })
      const store = useSession.getState()
      store.setWrapKey(secrets.wrapKey, pre.saltWrap)

      if (res.mfaRequired) {
        store.setMfa({ token: res.mfaToken, methods: res.methods, email: email.trim(), remember })
        navigate(`/signin/2fa?next=${encodeURIComponent(next)}`)
        return
      }

      // account still being set up: carry on where it stopped
      startSession(res)
      if (res.user.status === 'pendingMfa') {
        await unlockWith(secrets.wrapKey)
        navigate('/setup/2fa')
      } else {
        navigate('/setup/keys')
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        setPendingEmail(email.trim().toLowerCase())
        await authApi.resendVerification(email.trim()).catch(() => {})
        navigate('/verify-email')
        return
      }
      setError(
        err instanceof ApiError && err.code === 'INVALID_CREDENTIALS'
          ? 'That email and password do not match. Remember: nobody can look the password up for you.'
          : errorMessage(err),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthSplit
      aside={
        <AuthAside
          title="Encrypted at rest is not the same as encrypted from you."
          lead="Most vendors hold a key that can read your files. They promise not to. VaultShare removes the promise and the key."
          points={[
            {
              title: 'The server stores ciphertext',
              text: 'Object storage holds AES-256-GCM blobs, an IV and an auth tag. Nothing else.',
            },
            {
              title: 'Keys are wrapped per recipient',
              text: 'Access is granted by re-wrapping a data key, never by unlocking a shared vault key.',
            },
            {
              title: 'Support cannot escalate',
              text: 'There is no admin path to plaintext. An insider sees what an attacker sees.',
            },
          ]}
          footer="Cryptographic design: report section 3.10 · threat model: section 3.9"
        />
      }
    >
      <form className={s.form} onSubmit={submit}>
        <SectionMark num="00">Sign in</SectionMark>
        <h1 className={s.title}>Unlock your vault</h1>
        <p className={s.lead}>
          Your password decrypts your private key in this browser. The server receives neither.
        </p>

        {/* figma 50, "session expired" */}
        {expired && (
          <Callout tone="warn" icon="clock" title="Your session ended">
            Your private key was wiped from this tab&apos;s memory and the sign-in stopped working:
            it expired, or this device was signed out from another one. Sign in again to unwrap your
            key.
          </Callout>
        )}

        <TextField
          label="Work email"
          type="email"
          autoComplete="username"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={
            busy
              ? 'Deriving your key · Argon2id 64 MiB · a second or two, longer on a phone'
              : 'Unwraps your RSA-4096 private key locally.'
          }
        />
        <Checkbox
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          label="Keep me signed in on this device"
          sub="Your keys still lock after 15 idle minutes."
        />

        {error && <Callout tone="danger">{error}</Callout>}

        <Button type="submit" size="lg" block loading={busy} disabled={!email || !password}>
          Unlock vault
        </Button>

        <div className={s.links}>
          <span>
            Lost your password? <Link to="/forgot">There is no reset — read why</Link>
          </span>
          <span>
            No account yet? <Link to="/signup">Create a vault</Link>
          </span>
        </div>

        {/* figma 52: phones get told why unlocking takes a moment */}
        <aside className={s.phoneNote}>
          <Icon name="key" className={s.phoneNoteIcon} />
          <div>
            <p className={s.phoneNoteTitle}>Slower on a phone, on purpose</p>
            <p className={s.mono}>
              Argon2id needs 64 MiB of memory to turn your password into a key. A phone takes a few
              seconds; anyone holding a stolen copy of the database pays the same for every guess.
            </p>
          </div>
        </aside>
      </form>
    </AuthSplit>
  )
}
