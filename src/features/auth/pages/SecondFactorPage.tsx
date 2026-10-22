import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, OptionCard, SectionMark } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import { signOut } from '../session'
import s from '../auth.module.css'

const webauthnSupported = typeof window !== 'undefined' && 'PublicKeyCredential' in window

// a second factor is mandatory: the choice is which one, not whether (book 3.20.2)
export default function SecondFactorPage() {
  useDocumentTitle('Add a second factor')
  const navigate = useNavigate()
  const [method, setMethod] = useState('totp')

  return (
    <StepCard
      step="Step 3 of 3"
      footer={
        <>
          <Button
            variant="ghost"
            size="lg"
            onClick={async () => {
              await signOut()
              navigate('/signin')
            }}
          >
            Finish later
          </Button>
          <Button
            size="lg"
            onClick={() => navigate(method === 'webauthn' ? '/setup/2fa/key' : '/setup/2fa/app')}
          >
            Continue
          </Button>
        </>
      }
    >
      <SectionMark num="03">Two-factor</SectionMark>
      <h1 className={s.title}>Add a second factor</h1>
      <p className={s.lead}>
        Your password unlocks your private key. A second factor protects the account itself.
      </p>

      <div className={s.stack} role="radiogroup" aria-label="Second factor">
        <OptionCard
          name="factor"
          value="totp"
          checked={method === 'totp'}
          onChange={setMethod}
          icon="key"
          title="Authenticator app (TOTP)"
          meta="RFC 6238 · 30-second window · SHA-1 · 6 digits"
          tag={{ label: 'Recommended', tone: 'accent' }}
        >
          A rotating 6-digit code from Aegis, 1Password or Google Authenticator. Works with no
          network.
        </OptionCard>
        <OptionCard
          name="factor"
          value="webauthn"
          checked={method === 'webauthn'}
          onChange={setMethod}
          disabled={!webauthnSupported}
          icon="shield"
          title="Security key (FIDO2 / WebAuthn)"
          meta={
            webauthnSupported
              ? 'YubiKey, Titan, passkey · user verification required'
              : 'This browser does not support WebAuthn'
          }
          tag={{ label: 'Strongest', tone: 'accent' }}
        >
          A hardware key you physically touch. Phishing-resistant because the origin is bound into
          the signature.
        </OptionCard>
        <OptionCard
          name="factor"
          value="recovery"
          checked={false}
          onChange={() => {}}
          disabled
          icon="list"
          title="Recovery codes"
          meta="10 codes · one-time use · store them offline"
          tag={{ label: 'Backup', tone: 'neutral' }}
        >
          Ten single-use codes for a lost device. A fallback, not a daily factor — you get them
          right after adding one of the above.
        </OptionCard>
      </div>

      <p className={s.links}>
        You can enrol more than one later from Security settings. A vault cannot be shared with you
        until at least one factor beyond your password is active.
      </p>
    </StepCard>
  )
}
