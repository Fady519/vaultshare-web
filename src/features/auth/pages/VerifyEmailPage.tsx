import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Callout, CodeInput, Icon, SectionMark, TextField, toast } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { authApi } from '@/api/auth'
import { ApiError, errorMessage } from '@/api/client'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import { MockInbox } from '../components/MockHelper'
import { clearPendingEmail, getPendingEmail, setPendingEmail, startSession } from '../session'
import s from '../auth.module.css'
import styles from './VerifyEmailPage.module.css'

const RESEND_AFTER = 30

export default function VerifyEmailPage() {
  useDocumentTitle('Confirm your address')
  const navigate = useNavigate()
  const [email, setEmail] = useState(() => getPendingEmail() ?? '')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sentAt, setSentAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const ago = Math.round((now - sentAt) / 1000)
  const wait = Math.max(0, RESEND_AFTER - ago)

  async function verify(value = code) {
    if (value.length !== 6 || !email) return
    setBusy(true)
    setError(null)
    try {
      const session = await authApi.verifyEmail({ email, code: value })
      startSession(session)
      clearPendingEmail()
      navigate('/setup/keys', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError && err.errors?.code ? err.errors.code[0] : errorMessage(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    try {
      await authApi.resendVerification(email)
      setSentAt(Date.now())
      toast('A new code is on its way.', 'ok')
    } catch (err) {
      toast(errorMessage(err), 'warn')
    }
  }

  return (
    <StepCard
      step="Sign-up · confirm email"
      width={720}
      footer={
        <>
          <Button variant="ghost" size="lg" to="/signup">
            Change address
          </Button>
          <Button size="lg" loading={busy} disabled={code.length !== 6} onClick={() => verify()}>
            Verify
          </Button>
        </>
      }
    >
      <SectionMark num="32">Onboarding</SectionMark>
      <h1 className={s.title}>Confirm your address</h1>
      <p className={s.lead}>
        One code, one address. This is the channel used for security alerts, never for key material.
      </p>

      {getPendingEmail() ? (
        <div className={styles.sent}>
          <span className={styles.bell}>
            <Icon name="bell" />
          </span>
          <div>
            <p className={styles.address}>{email}</p>
            <p className={styles.when}>
              A six digit code was sent{' '}
              {ago < 60 ? `${ago} seconds` : `${Math.floor(ago / 60)} min`} ago. It expires in 10
              minutes.
            </p>
          </div>
        </div>
      ) : (
        <TextField
          label="Email you signed up with"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setPendingEmail(e.target.value.trim().toLowerCase())
          }}
        />
      )}

      <CodeInput
        label="Verification code"
        value={code}
        onChange={(v) => {
          setCode(v)
          setError(null)
        }}
        onComplete={verify}
        error={Boolean(error)}
        disabled={busy}
        autoFocus
      />
      {error && <Callout tone="danger">{error}</Callout>}

      <p className={s.note}>
        Didn&apos;t arrive?{' '}
        {wait > 0 ? (
          `Resend in 0:${String(wait).padStart(2, '0')}`
        ) : (
          <button type="button" className={s.link} onClick={resend}>
            Resend the code
          </button>
        )}{' '}
        · check spam before asking support.
      </p>
      <p className={s.note}>
        Verification proves the address. It does not unlock anything: the vault still needs your
        password and your second factor.
      </p>

      <MockInbox
        email={email}
        onUseCode={(c) => {
          setCode(c)
          verify(c)
        }}
      />
    </StepCard>
  )
}
