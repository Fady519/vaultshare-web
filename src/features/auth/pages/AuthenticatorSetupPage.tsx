import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { Button, Callout, CodeInput, SectionMark, Skeleton } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { mfaApi } from '@/api/auth'
import { ApiError, errorMessage } from '@/api/client'
import type { TotpSetupResponse } from '@/api/types'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import { useSession } from '@/store/session'
import { MockAuthenticator } from '../components/MockHelper'
import s from '../auth.module.css'
import styles from './AuthenticatorSetupPage.module.css'

const secondsLeft = () => 30 - (Math.floor(Date.now() / 1000) % 30)

export default function AuthenticatorSetupPage() {
  useDocumentTitle('Set up an authenticator app')
  const navigate = useNavigate()
  const email = useSession((st) => st.user?.email ?? '')
  const [setup, setSetup] = useState<TotpSetupResponse | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [left, setLeft] = useState(secondsLeft)
  const started = useRef(false)

  useEffect(() => {
    // StrictMode runs effects twice in dev; one enrolment is enough
    if (started.current) return
    started.current = true
    mfaApi
      .totpSetup()
      .then(async (res) => {
        setSetup(res)
        // drawn here in the browser: the secret is never sent to a QR service
        setQr(await QRCode.toDataURL(res.otpauthUri, { width: 188, margin: 1 }))
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  useEffect(() => {
    const t = setInterval(() => setLeft(secondsLeft()), 1000)
    return () => clearInterval(t)
  }, [])

  async function confirm(value = code) {
    if (value.length !== 6) return
    setBusy(true)
    setError(null)
    try {
      await mfaApi.totpConfirm(value)
      navigate('/setup/recovery-codes')
    } catch (err) {
      setError(err instanceof ApiError && err.errors?.code ? err.errors.code[0] : errorMessage(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  async function copySecret() {
    if (setup) await navigator.clipboard.writeText(setup.secret)
  }

  return (
    <StepCard
      step="Step 3 of 3"
      footer={
        <>
          <Button variant="ghost" size="lg" to="/setup/2fa">
            Back
          </Button>
          <Button size="lg" loading={busy} disabled={code.length !== 6} onClick={() => confirm()}>
            Verify and finish setup
          </Button>
        </>
      }
    >
      <SectionMark num="03">Multi-factor</SectionMark>
      <h1 className={s.title}>Add a second factor</h1>
      <p className={s.lead}>
        TOTP protects the account. It is deliberately separate from the key material that decrypts
        your files.
      </p>

      <div className={styles.pair}>
        <div className={styles.qr}>
          {qr ? (
            <img src={qr} alt="QR code for your authenticator app" width={188} height={188} />
          ) : (
            <Skeleton width={188} height={188} />
          )}
        </div>
        <div className={styles.manual}>
          <p className={styles.scanTitle}>Scan with any authenticator</p>
          <p className={styles.scanText}>
            1Password, Aegis, Google Authenticator or a hardware token.
          </p>
          <p className={s.label}>Or enter this key manually</p>
          <div className={styles.secret}>
            <code>{setup ? setup.secret.match(/.{1,4}/g)!.join(' ') : '…'}</code>
            <button type="button" onClick={copySecret}>
              Copy
            </button>
          </div>
          <p className={s.mono}>SHA-1 · 6 digits · 30s period (RFC 6238)</p>
        </div>
      </div>

      <div className={s.stack}>
        <p className={s.label}>Enter the code shown in your app</p>
        <div className={s.row}>
          <CodeInput
            label="Authenticator code"
            value={code}
            onChange={(v) => {
              setCode(v)
              setError(null)
            }}
            onComplete={confirm}
            error={Boolean(error)}
            disabled={busy || !setup}
          />
          <span className={styles.refresh}>Refreshes in {left}s</span>
        </div>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      {/* only once this page's secret exists, or it would show the code of the one it replaced */}
      {setup && (
        <MockAuthenticator
          email={email}
          onUseCode={(c) => {
            setCode(c)
            confirm(c)
          }}
        />
      )}
    </StepCard>
  )
}
