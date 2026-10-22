import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { startRegistration } from '@simplewebauthn/browser'
import { Button, Callout, DataCell, DataGrid, Icon, SectionMark, TextField } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { mfaApi } from '@/api/auth'
import { errorMessage } from '@/api/client'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import { cx } from '@/utils/cx'
import s from '../auth.module.css'
import styles from './SecurityKeySetupPage.module.css'

type State = 'idle' | 'waiting' | 'done' | 'failed'

export default function SecurityKeySetupPage() {
  useDocumentTitle('Register a security key')
  const navigate = useNavigate()
  const [name, setName] = useState('Security key')
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)

  async function register() {
    setState('waiting')
    setError(null)
    try {
      const { options } = await mfaApi.webauthnOptions()
      // the browser shows its own dialog here; the private half stays on the key
      const attestation = await startRegistration({
        optionsJSON: options as Parameters<typeof startRegistration>[0]['optionsJSON'],
      })
      await mfaApi.webauthnRegister(name.trim() || 'Security key', attestation)
      setState('done')
    } catch (err) {
      setState('failed')
      const e = err as Error
      setError(
        e.name === 'NotAllowedError'
          ? 'The request was cancelled or timed out. Try again and touch the key when it blinks.'
          : errorMessage(err),
      )
    }
  }

  const title =
    state === 'waiting'
      ? 'Waiting for your authenticator'
      : state === 'done'
        ? 'Key registered'
        : 'Ready when you are'
  const sub =
    state === 'waiting'
      ? 'Insert the key and touch the metal contact'
      : state === 'done'
        ? `“${name}” can now sign you in`
        : 'Your browser will open its own dialog'

  return (
    <StepCard
      step="Step 3 of 3"
      footer={
        <>
          <Button variant="ghost" size="lg" to="/setup/2fa">
            Use a different method
          </Button>
          {state === 'done' ? (
            <Button size="lg" onClick={() => navigate('/setup/recovery-codes')}>
              Continue
            </Button>
          ) : (
            <Button size="lg" loading={state === 'waiting'} onClick={register}>
              Register key
            </Button>
          )}
        </>
      }
    >
      <SectionMark num="03b">WebAuthn</SectionMark>
      <h1 className={s.title}>Register a security key</h1>
      <p className={s.lead}>
        VaultShare asks your browser for a FIDO2 credential. The private half never leaves the
        hardware.
      </p>

      <div className={cx(styles.stage, state === 'waiting' && styles.pulse)}>
        <span className={cx(styles.ring, state === 'done' && styles.ok)}>
          <Icon name={state === 'done' ? 'check' : 'key'} size={20} />
        </span>
        <p className={styles.stageTitle} aria-live="polite">
          {title}
        </p>
        <p className={styles.stageSub}>{sub}</p>
      </div>

      {state !== 'done' && (
        <TextField
          label="Name this key"
          value={name}
          onChange={(e) => setName(e.target.value)}
          hint="People often register two keys. A name tells them apart later."
        />
      )}

      <DataGrid cols={3}>
        <DataCell label="Relying party">{window.location.hostname}</DataCell>
        <DataCell label="User verification">required</DataCell>
        <DataCell label="Attestation">none</DataCell>
        <DataCell label="Algorithm">ES256 (-7) · RS256 (-257)</DataCell>
        <DataCell label="Transports">usb · nfc · hybrid · internal</DataCell>
        <DataCell label="Credential">resident · discoverable</DataCell>
      </DataGrid>

      {error && <Callout tone="danger">{error}</Callout>}

      <p className={s.note}>
        The key signs a challenge bound to {window.location.hostname}. A lookalike domain cannot
        replay it, which is why this factor beats a code you can be talked into reading aloud.
      </p>
    </StepCard>
  )
}
