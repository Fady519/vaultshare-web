import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Callout, Checkbox, SectionMark, Skeleton, TextField, toast } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { mfaApi } from '@/api/auth'
import { ApiError, errorMessage } from '@/api/client'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import { useSession } from '@/store/session'
import { downloadText } from '@/utils/download'
import { acceptPendingInvite, updateUser } from '../session'
import s from '../auth.module.css'
import styles from './RecoveryCodesPage.module.css'

/*
  Ten single-use codes for a lost second factor. They restore account access,
  they do NOT decrypt anything (that's the 12-word kit).
  This is the one screen that deliberately blocks you until you prove you kept them.
*/
export default function RecoveryCodesPage() {
  useDocumentTitle('Save your recovery codes')
  const navigate = useNavigate()
  const user = useSession((st) => st.user)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [stored, setStored] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    mfaApi
      .recoveryCodes()
      .then((res) => setCodes(res.codes))
      .catch((err) => setError(errorMessage(err)))
  }, [])

  const text = codes
    ? [
        'VaultShare MFA recovery codes',
        `Account: ${user?.email}`,
        '',
        ...codes.map((c, i) => `${String(i + 1).padStart(2, '0')}  ${c}`),
        '',
        'Each code works once and replaces your second factor if you lose it.',
        'They do not decrypt files. Keep them away from this device.',
      ].join('\n')
    : ''

  function print() {
    const w = window.open('', '_blank', 'width=480,height=640')
    if (!w) return
    const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    w.document.write(`<pre style="font:14px/1.6 monospace;padding:24px">${safe}</pre>`)
    w.document.close()
    w.print()
  }

  async function finish() {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      await mfaApi.confirmRecoveryCode(confirm.trim())
      await acceptPendingInvite()
      toast('Your vault is ready.', 'ok')
      // flipping the status lets the app routes in; the guard would redirect us anyway
      updateUser({ ...user, status: 'active', mfaEnabled: true })
      navigate('/vaults', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError && err.errors?.code ? err.errors.code[0] : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepCard
      step="Step 3 of 3"
      footer={
        <>
          <Button variant="ghost" size="lg" to="/setup/2fa">
            Back
          </Button>
          <Button
            size="lg"
            loading={busy}
            disabled={!stored || confirm.trim().length < 8}
            onClick={finish}
          >
            Continue
          </Button>
        </>
      }
    >
      <SectionMark num="03c">Recovery</SectionMark>
      <h1 className={s.title}>Save your recovery codes</h1>
      <p className={s.lead}>
        These are the only way back in if you lose every enrolled device. They are shown once.
      </p>

      <ol className={styles.codes} aria-label="Recovery codes">
        {codes
          ? codes.map((c, i) => (
              <li key={c}>
                <span className={styles.n}>{String(i + 1).padStart(2, '0')}</span>
                <code>{c}</code>
              </li>
            ))
          : Array.from({ length: 10 }, (_, i) => (
              <li key={i}>
                <Skeleton width={90} height={10} />
              </li>
            ))}
      </ol>

      <div className={s.row}>
        <Button
          variant="ghost"
          icon="down"
          disabled={!codes}
          onClick={() => downloadText('vaultshare-recovery-codes.txt', text)}
        >
          Download .txt
        </Button>
        <Button variant="ghost" icon="file" disabled={!codes} onClick={print}>
          Print
        </Button>
        <Button
          variant="ghost"
          icon="list"
          disabled={!codes}
          onClick={async () => {
            await navigator.clipboard.writeText(codes!.join('\n'))
            toast('Codes copied.', 'ok')
          }}
        >
          Copy all
        </Button>
      </div>

      <Callout tone="warn">
        Each code works once. Screenshotting them into the same laptop you are protecting defeats
        the point — print them or put them in a password manager on another device.
      </Callout>

      <Checkbox
        checked={stored}
        onChange={(e) => setStored(e.target.checked)}
        label="I have stored these codes somewhere I can reach without this laptop."
      />

      {stored && (
        <TextField
          label="Type one of the codes to confirm"
          mono
          placeholder="XXXX-XXXX"
          autoFocus
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value.toUpperCase())
            setError(null)
          }}
          error={error ?? undefined}
        />
      )}
      {error && !stored && <Callout tone="danger">{error}</Callout>}
    </StepCard>
  )
}
