import { useState, type FormEvent } from 'react'
import { Button, Callout, OptionCard, SectionMark, TextField } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { authApi } from '@/api/auth'
import { errorMessage } from '@/api/client'
import type { RecoveryMode } from '@/api/types'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import { MockInbox } from '../components/MockHelper'
import s from '../auth.module.css'

/*
  The honest version of "forgot password" (book 3.20.2): only the 12-word kit can
  bring the files back. The email-only path recovers the account, not the data.
*/
export default function ForgotPasswordPage() {
  useDocumentTitle('Get back into your account')
  const [mode, setMode] = useState<RecoveryMode>('kit')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await authApi.recoveryStart(email.trim(), mode)
      setSent(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <StepCard
        footer={
          <Button variant="ghost" size="lg" to="/signin">
            Back to sign in
          </Button>
        }
      >
        <SectionMark num="00">Recovery</SectionMark>
        <h1 className={s.title}>Check your inbox</h1>
        <p className={s.lead}>
          If {email} has an account, a signed recovery link is on its way. It works once, for 15
          minutes. For your safety this page looks the same whether or not the address exists.
        </p>
        <MockInbox email={email.trim().toLowerCase()} />
      </StepCard>
    )
  }

  return (
    <StepCard
      footer={
        <>
          <Button variant="ghost" size="lg" to="/signin">
            Back to sign in
          </Button>
          <Button size="lg" type="submit" form="forgot" loading={busy} disabled={!email}>
            Send recovery link
          </Button>
        </>
      }
    >
      <form id="forgot" className={s.form} onSubmit={submit}>
        <SectionMark num="00">Recovery</SectionMark>
        <h1 className={s.title}>Get back into your account</h1>
        <p className={s.lead}>
          There are two very different problems here, and VaultShare can only solve one of them.
        </p>

        <div className={s.stack} role="radiogroup" aria-label="What do you still have">
          <OptionCard
            name="mode"
            value="kit"
            checked={mode === 'kit'}
            onChange={(v) => setMode(v as RecoveryMode)}
            icon="key"
            title="I have my recovery kit"
            meta="Full recovery · files stay readable"
            tag={{ label: 'Works', tone: 'accent' }}
          >
            The twelve words from your key ceremony rebuild the private key, then a new password
            re-wraps it.
          </OptionCard>
          <OptionCard
            name="mode"
            value="reset"
            checked={mode === 'reset'}
            onChange={(v) => setMode(v as RecoveryMode)}
            icon="lock"
            title="I only remember my email"
            meta="Account recovery only · existing files stay encrypted"
            tag={{ label: 'Partial', tone: 'warn' }}
          >
            We can return the account to you. We cannot return the files — nobody here can unwrap
            that key.
          </OptionCard>
        </div>

        <TextField
          label="Account email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          hint="A signed recovery link is valid for 15 minutes and single use."
        />

        <Callout tone="warn">
          A password reset is not a data reset. Without your recovery kit the ciphertext stays
          ciphertext — that is the guarantee working, not a bug.
        </Callout>
        {error && <Callout tone="danger">{error}</Callout>}
      </form>
    </StepCard>
  )
}
