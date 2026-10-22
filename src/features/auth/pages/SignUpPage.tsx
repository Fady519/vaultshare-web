import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Callout, Checkbox, SectionMark, TextField } from '@/components'
import { AuthSplit } from '@/layouts/AuthSplit/AuthSplit'
import { authApi, useInvitation } from '@/api/auth'
import { ApiError, errorMessage } from '@/api/client'
import { cryptoSupport, newPasswordSecrets } from '@/crypto'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import { useSession } from '@/store/session'
import { passwordStrength } from '@/utils/passwordStrength'
import { AuthAside } from '../components/AuthAside'
import { rememberInvite, setPendingEmail } from '../session'
import s from '../auth.module.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignUpPage() {
  useDocumentTitle('Create your account')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const inviteToken = params.get('invite') ?? undefined
  const invite = useInvitation(inviteToken)
  const support = useMemo(cryptoSupport, [])

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  // invited people sign up with the address the invite went to
  const shownEmail = invite.data?.email ?? email
  const strength = passwordStrength(password, shownEmail)
  const emailOk = EMAIL_RE.test(shownEmail)
  const confirmOk = confirm.length > 0 && confirm === password

  function validate() {
    const e: Record<string, string> = {}
    if (name.trim().length < 2) e.name = 'Tell us what to call you.'
    if (!emailOk) e.email = 'Enter a full email address.'
    if (!strength.acceptable) e.password = strength.hint ?? 'Choose a stronger password.'
    if (!confirmOk) e.confirm = 'The two passwords don’t match.'
    if (!understood) e.understood = 'Tick this box — it’s the one rule of the product.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setBusy(true)
    try {
      // the password stops here: only the verifier and two salts are sent
      const secrets = await newPasswordSecrets(password)
      await authApi.register({
        email: shownEmail.trim(),
        displayName: name.trim(),
        saltAuth: secrets.saltAuth,
        saltWrap: secrets.saltWrap,
        verifier: secrets.verifier,
      })
      useSession.getState().setWrapKey(secrets.wrapKey)
      setPendingEmail(shownEmail.trim().toLowerCase())
      if (inviteToken) rememberInvite(inviteToken)
      navigate('/verify-email')
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])))
      } else {
        setErrors({ form: errorMessage(err) })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthSplit
      step="Step 1 of 3"
      aside={
        <AuthAside
          title="Files leave the browser already unreadable."
          lead="VaultShare encrypts every file with AES-256-GCM before upload, then wraps the data key to each recipient's public key."
          points={[
            {
              title: 'AES-256-GCM per file',
              text: 'A fresh 256-bit data key for every object, with its own IV and authentication tag.',
            },
            {
              title: 'RSA-4096 OAEP key wrapping',
              text: 'Recipients receive a wrapped copy of the data key. Never the key itself.',
            },
            {
              title: 'Argon2id password derivation',
              text: 'm=64 MiB, t=3, p=4. Tuned so a stolen database is not a shortcut.',
            },
            {
              title: 'Zero-knowledge by construction',
              text: 'Support staff see the same ciphertext an attacker would.',
            },
          ]}
          footer="HTI graduation project · cryptography described in chapter 3 of the report"
        />
      }
    >
      <form className={s.form} onSubmit={submit} noValidate>
        <SectionMark num="01">Create account</SectionMark>
        <h1 className={s.title}>Create your account</h1>
        <p className={s.lead}>
          Your password never leaves this device. It derives the key that wraps your private key.
        </p>

        {!support.ok && (
          <Callout tone="danger" title="This browser can't protect your files">
            It is missing {support.missing.join(', ')}. We refuse rather than fall back to weaker
            encryption. Use a current Chrome, Edge, Firefox or Safari.
          </Callout>
        )}

        {invite.data && (
          <Callout tone="ok" icon="users">
            {invite.data.inviterName} invited you to <strong>{invite.data.vaultName}</strong>.
            Create your account with the invited address to join.
          </Callout>
        )}

        <TextField
          label="Your name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name ?? errors.displayName}
        />
        <TextField
          label="Work email"
          type="email"
          autoComplete="email"
          value={shownEmail}
          readOnly={Boolean(invite.data)}
          onChange={(e) => setEmail(e.target.value)}
          valid={emailOk}
          error={errors.email}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={
            password
              ? `Argon2id · m=64 MiB, t=3, p=4 · strength: ${strength.label}${strength.bits ? ` (${strength.bits} bits)` : ''}`
              : 'At least 12 characters. A few unrelated words work well.'
          }
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          valid={confirmOk}
          error={errors.confirm}
        />

        <div>
          <Checkbox
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            label="I understand no one can reset this password for me."
            sub="Only the recovery kit you get in the next step can."
          />
          {errors.understood && <p className={s.error}>{errors.understood}</p>}
        </div>

        {errors.form && <Callout tone="danger">{errors.form}</Callout>}

        <div>
          <Button type="submit" size="lg" loading={busy} disabled={!support.ok}>
            {busy ? 'Deriving your key…' : 'Continue'}
          </Button>
        </div>

        <div className={s.links}>
          <span>
            Already have a vault? <Link to="/signin">Sign in</Link>
          </span>
        </div>
      </form>
    </AuthSplit>
  )
}
