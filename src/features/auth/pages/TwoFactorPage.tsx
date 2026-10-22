import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { startAuthentication } from '@simplewebauthn/browser'
import {
  Button,
  Callout,
  CodeInput,
  DataCell,
  DataGrid,
  Icon,
  SectionMark,
  TextField,
} from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { authApi } from '@/api/auth'
import { ApiError, errorMessage } from '@/api/client'
import type { SessionResponse } from '@/api/types'
import { DecryptError } from '@/crypto'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import { useSession } from '@/store/session'
import { describeDevice } from '@/utils/device'
import { formatDate, formatTime } from '@/utils/format'
import { MockAuthenticator } from '../components/MockHelper'
import { acceptPendingInvite, safeNext, startSession, unlockWith } from '../session'
import s from '../auth.module.css'
import styles from './TwoFactorPage.module.css'

type Mode = 'totp' | 'recovery'

const secondsLeft = () => 30 - (Math.floor(Date.now() / 1000) % 30)

export default function TwoFactorPage() {
  useDocumentTitle('Two-factor check')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  // read once: finishing sign-in clears both from the store while we still need them
  const [mfa] = useState(() => useSession.getState().mfa)
  const [wrapKey] = useState(() => useSession.getState().wrapKey)

  const [mode, setMode] = useState<Mode>(() =>
    mfa && !mfa.methods.includes('totp') && mfa.methods.includes('recovery') ? 'recovery' : 'totp',
  )
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [left, setLeft] = useState(secondsLeft)
  const [startedAt] = useState(() => new Date().toISOString())

  useEffect(() => {
    const t = setInterval(() => setLeft(secondsLeft()), 1000)
    return () => clearInterval(t)
  }, [])

  // reloaded the page or came here directly: start from the password again
  if (!mfa || !wrapKey) return <Navigate to="/signin" replace />

  async function finish(session: SessionResponse) {
    startSession(session)
    // the second factor is accepted, now the private key gets unwrapped (locally)
    await unlockWith(wrapKey!)
    await acceptPendingInvite()
    navigate(next, { replace: true })
  }

  async function verify(value?: string) {
    const c = mode === 'totp' ? (value ?? code) : recovery.trim()
    if (mode === 'totp' && c.length !== 6) return
    setBusy(true)
    setError(null)
    try {
      const res = await authApi.loginMfa({
        mfaToken: mfa!.token,
        method: mode,
        code: c,
        rememberDevice: mfa!.remember,
      })
      await finish(res)
    } catch (err) {
      setError(
        err instanceof DecryptError
          ? 'Signed in, but your password did not decrypt your private key.'
          : err instanceof ApiError && err.code === 'MFA_INVALID'
            ? mode === 'totp'
              ? 'That code did not work. Wait for the next one and try again.'
              : 'That recovery code is wrong or was already used.'
            : errorMessage(err),
      )
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  async function useSecurityKey() {
    setBusy(true)
    setError(null)
    try {
      const { options } = await authApi.loginWebauthnOptions(mfa!.token)
      const assertion = await startAuthentication({
        optionsJSON: options as Parameters<typeof startAuthentication>[0]['optionsJSON'],
      })
      await finish(await authApi.loginWebauthn(mfa!.token, assertion, mfa!.remember))
    } catch (err) {
      setError(
        (err as Error).name === 'NotAllowedError'
          ? 'The security key request was cancelled or timed out.'
          : errorMessage(err),
      )
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    useSession.getState().setMfa(null)
    useSession.getState().setWrapKey(null)
    navigate('/signin')
  }

  return (
    <StepCard
      width={700}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={cancel}>
            Cancel
          </Button>
          <Button
            size="lg"
            loading={busy}
            disabled={mode === 'totp' ? code.length !== 6 : recovery.trim().length < 8}
            onClick={() => verify()}
          >
            Verify
          </Button>
        </>
      }
    >
      <SectionMark num="01">Verify</SectionMark>
      {mode === 'totp' ? (
        <>
          <h1 className={s.title}>Enter your 6-digit code</h1>
          <p className={s.lead}>
            Password accepted. One more factor before your private key is unwrapped.
          </p>
          <div className={styles.code}>
            <CodeInput
              label="Authenticator code"
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
            <p className={s.mono}>Code refreshes in {left}s · from your authenticator app</p>
          </div>
        </>
      ) : (
        <>
          <h1 className={s.title}>Use a recovery code</h1>
          <p className={s.lead}>
            One of the ten codes you saved at sign-up. It works once and is then spent.
          </p>
          <TextField
            label="Recovery code"
            mono
            placeholder="XXXX-XXXX"
            autoFocus
            value={recovery}
            onChange={(e) => {
              setRecovery(e.target.value.toUpperCase())
              setError(null)
            }}
          />
        </>
      )}

      {error && <Callout tone="danger">{error}</Callout>}

      <div className={styles.alternatives}>
        {mfa.methods.includes('webauthn') && (
          <button type="button" className={s.accentLink} onClick={useSecurityKey} disabled={busy}>
            <Icon name="shield" /> Use a security key instead
          </button>
        )}
        {mode === 'totp' && mfa.methods.includes('recovery') && (
          <button type="button" className={s.accentLink} onClick={() => setMode('recovery')}>
            <Icon name="key" /> Use a recovery code
          </button>
        )}
        {mode === 'recovery' && mfa.methods.includes('totp') && (
          <button type="button" className={s.accentLink} onClick={() => setMode('totp')}>
            <Icon name="clock" /> Use my authenticator app
          </button>
        )}
      </div>

      <DataGrid cols={3}>
        <DataCell label="Account">{mfa.email}</DataCell>
        <DataCell label="Device">{describeDevice()}</DataCell>
        <DataCell label="Time">
          {formatDate(startedAt)}, {formatTime(startedAt)}
        </DataCell>
      </DataGrid>

      {mode === 'totp' && (
        <MockAuthenticator
          email={mfa.email}
          onUseCode={(c) => {
            setCode(c)
            verify(c)
          }}
        />
      )}
    </StepCard>
  )
}
