import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Callout, Checkbox, SectionMark, Skeleton, TextField } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { authApi } from '@/api/auth'
import { errorMessage } from '@/api/client'
import type { RecoveryVerifyResponse } from '@/api/types'
import {
  checkRecoveryKit,
  DecryptError,
  fromBase64,
  isValidPhrase,
  newPasswordSecrets,
  newRecoveryPhrase,
  normalizePhrase,
  rewrapWithNewPassword,
  rsaDecrypt,
  runKeyCeremony,
  toBase64,
} from '@/crypto'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import { downloadText } from '@/utils/download'
import { passwordStrength } from '@/utils/passwordStrength'
import { RecoveryWords } from '../components/RecoveryWords'
import { StrengthMeter } from '../components/StrengthMeter'
import s from '../auth.module.css'
import styles from './ResetPasswordPage.module.css'

type Step = 'loading' | 'invalid' | 'words' | 'password' | 'newkit' | 'done'

export default function ResetPasswordPage() {
  useDocumentTitle('Set a new password')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [info, setInfo] = useState<RecoveryVerifyResponse | null>(null)
  const [step, setStep] = useState<Step>('loading')
  const [phrase, setPhrase] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [newWords, setNewWords] = useState<string[]>([])
  const [savedKit, setSavedKit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // once only: every verify call issues a fresh challenge
    if (started.current) return
    started.current = true
    if (!token) {
      setStep('invalid')
      return
    }
    authApi
      .recoveryVerify(token)
      .then((res) => {
        setInfo(res)
        setStep(res.mode === 'kit' ? 'words' : 'password')
      })
      .catch(() => setStep('invalid'))
  }, [token])

  const words = normalizePhrase(phrase).split(' ').filter(Boolean)
  const phraseOk = isValidPhrase(words)
  const strength = passwordStrength(password, info?.email)
  const confirmOk = confirm.length > 0 && confirm === password
  const isReset = info?.mode === 'reset'

  async function openKit() {
    if (!info?.sealedRecoveryKey) return
    setBusy(true)
    setError(null)
    try {
      await checkRecoveryKit(words, info.sealedRecoveryKey)
      setStep('password')
    } catch (err) {
      setError(
        err instanceof DecryptError
          ? 'These twelve words are valid, but they do not open this account’s kit.'
          : errorMessage(err),
      )
    } finally {
      setBusy(false)
    }
  }

  async function rewrap() {
    if (!info) return
    setBusy(true)
    setError(null)
    try {
      if (info.mode === 'kit') {
        // same private key, new password around it — done here before anything is sent
        const r = await rewrapWithNewPassword(words, info.sealedRecoveryKey!, password)
        const answer = await rsaDecrypt(r.privateKey, fromBase64(info.challenge!))
        await authApi.recoveryComplete({
          token,
          saltAuth: r.saltAuth,
          saltWrap: r.saltWrap,
          verifier: r.verifier,
          sealedPrivateKey: r.sealedPrivateKey,
          challengeAnswer: toBase64(answer),
        })
        setStep('done')
      } else {
        // email-only: brand new keys and a brand new recovery kit
        const secrets = await newPasswordSecrets(password)
        const kit = newRecoveryPhrase()
        const keys = await runKeyCeremony(secrets.wrapKey, kit)
        await authApi.recoveryComplete({
          token,
          saltAuth: secrets.saltAuth,
          saltWrap: secrets.saltWrap,
          verifier: secrets.verifier,
          sealedPrivateKey: keys.sealedPrivateKey,
          publicKey: keys.publicKey,
          sealedRecoveryKey: keys.sealedRecoveryKey,
        })
        setNewWords(kit)
        setStep('newkit')
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const stepLabel =
    step === 'words'
      ? 'Recovery · step 2 of 3'
      : step === 'password'
        ? 'Recovery · step 3 of 3'
        : 'Recovery'

  if (step === 'loading') {
    return (
      <StepCard step="Recovery" width={760}>
        <Skeleton width={240} height={28} />
        <Skeleton height={44} />
      </StepCard>
    )
  }

  if (step === 'invalid') {
    return (
      <StepCard
        step="Recovery"
        width={760}
        footer={
          <Button size="lg" to="/forgot" className={s.footerEnd}>
            Ask for a new link
          </Button>
        }
      >
        <SectionMark num="31">Recovery</SectionMark>
        <h1 className={s.title}>This link is no longer valid</h1>
        <p className={s.lead}>
          Recovery links work once, for 15 minutes. This one has expired or was already used.
        </p>
      </StepCard>
    )
  }

  if (step === 'done') {
    return (
      <StepCard
        step="Recovery"
        width={760}
        footer={
          <Button size="lg" to="/signin" className={s.footerEnd}>
            Sign in
          </Button>
        }
      >
        <SectionMark num="31">Recovery</SectionMark>
        <h1 className={s.title}>Password changed</h1>
        <p className={s.lead}>
          {isReset
            ? 'Your account has new keys and a new recovery kit. Every other session was signed out.'
            : 'Your private key was re-wrapped with the new password in this tab. Every other session was signed out.'}
        </p>
      </StepCard>
    )
  }

  if (step === 'newkit') {
    return (
      <StepCard
        step="Recovery"
        footer={
          <Button
            size="lg"
            disabled={!savedKit}
            className={s.footerEnd}
            onClick={() => setStep('done')}
          >
            Continue
          </Button>
        }
      >
        <SectionMark num="31">Recovery</SectionMark>
        <h1 className={s.title}>Your new recovery kit</h1>
        <p className={s.lead}>
          New keys mean new words. The old kit no longer opens anything — replace it with these.
        </p>
        <RecoveryWords words={newWords} />
        <div className={s.row}>
          <Button
            variant="ghost"
            icon="down"
            onClick={() =>
              downloadText(
                'vaultshare-recovery-kit.txt',
                [
                  'VaultShare recovery kit',
                  `Account: ${info?.email}`,
                  '',
                  ...newWords.map((w, i) => `${String(i + 1).padStart(2, '0')}  ${w}`),
                ].join('\n'),
              )
            }
          >
            Download recovery kit
          </Button>
        </div>
        <Checkbox
          checked={savedKit}
          onChange={(e) => setSavedKit(e.target.checked)}
          label="I have stored these twelve words somewhere I can reach without this device."
        />
      </StepCard>
    )
  }

  if (step === 'words') {
    return (
      <StepCard
        step={stepLabel}
        width={760}
        footer={
          <>
            <Button variant="ghost" size="lg" to="/signin">
              Cancel
            </Button>
            <Button size="lg" loading={busy} disabled={!phraseOk} onClick={openKit}>
              Open recovery kit
            </Button>
          </>
        }
      >
        <SectionMark num="31">Recovery</SectionMark>
        <h1 className={s.title}>Enter your recovery kit</h1>
        <p className={s.lead}>
          The twelve words from your key ceremony, in order. They are checked and used in this tab
          only — they are never sent.
        </p>
        <div className={styles.phrase}>
          <label htmlFor="phrase" className={s.label}>
            Twelve words
          </label>
          <textarea
            id="phrase"
            rows={3}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="none"
            value={phrase}
            onChange={(e) => {
              setPhrase(e.target.value)
              setError(null)
            }}
            placeholder="harbor cadence tundra oblige …"
          />
          <p className={phraseOk ? styles.ok : s.mono}>
            {words.length}/12 words
            {words.length === 12 &&
              (phraseOk ? ' · checksum ok' : ' · checksum does not match, check each word')}
          </p>
        </div>
        {error && <Callout tone="danger">{error}</Callout>}
        <p className={s.note}>
          Lost the words too? Go back and choose “I only remember my email” — you keep the account,
          not the files.
        </p>
      </StepCard>
    )
  }

  // step === 'password'
  return (
    <StepCard
      step={stepLabel}
      width={760}
      footer={
        <>
          <Button variant="ghost" size="lg" to="/signin">
            Cancel
          </Button>
          <Button
            size="lg"
            loading={busy}
            disabled={!strength.acceptable || !confirmOk || (isReset && !accepted)}
            onClick={rewrap}
          >
            {isReset ? 'Create new keys' : 'Re-wrap and continue'}
          </Button>
        </>
      }
    >
      <SectionMark num="31">Recovery</SectionMark>
      <h1 className={s.title}>Set a new password</h1>
      <p className={s.lead}>
        {isReset
          ? 'Your account gets a new password and new keys. Choose the password first.'
          : 'You proved the recovery kit. Choose a password and your private key is re-wrapped locally before anything is sent back.'}
      </p>

      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint="Argon2id · m=64 MiB · t=3 · p=4, derived in this tab"
      />
      <TextField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        valid={confirmOk}
      />
      {password && <StrengthMeter strength={strength} />}

      {isReset ? (
        <>
          <Callout tone="danger" icon="lock" title="Your existing files stay encrypted">
            Without the recovery kit, the old private key is gone. Everything wrapped for it — your
            uploads and what others shared with you — cannot be opened again by anyone.
          </Callout>
          <Checkbox
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            label="I understand my existing files cannot be recovered."
          />
        </>
      ) : (
        <Callout tone="warn" icon="key" title="Your private key is about to be re-wrapped">
          The old password can no longer open your vault. Files stay encrypted with the same data
          keys, only the wrapping changes.
        </Callout>
      )}

      <Checkbox
        checked
        disabled
        onChange={() => {}}
        label="Sign every other device out after the change"
        sub="Always on for a password change."
      />
      {error && <Callout tone="danger">{error}</Callout>}
    </StepCard>
  )
}
