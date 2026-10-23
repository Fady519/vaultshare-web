import { useEffect, useRef, useState } from 'react'
import { Button, CodeInput, Icon, Modal, Tag } from '@/components'
import { authApi } from '@/api/auth'
import { errorMessage, setStepUpHandler } from '@/api/client'
import type { StepUpAction } from '@/api/types'
import { useSession } from '@/store/session'
import { MockAuthenticator } from './MockHelper'
import styles from './StepUpHost.module.css'

// what the person is about to do, in their words
const ACTION_TEXT: Record<StepUpAction, string> = {
  'share.grant': 'giving someone a key to a file',
  'share.change': "changing someone's access to a file",
  'share.revoke': "taking someone's key to a file away",
  'member.role': "changing a member's role",
  'member.revoke': 'removing a member from a vault',
  'member.invite': 'inviting someone to a vault',
  'link.create': 'creating a secure link',
  'link.revoke': 'revoking a secure link',
  'vault.delete': 'deleting a vault',
  'vault.transfer': 'handing a vault to someone else',
  'account.delete': 'deleting your account',
  'keys.rotate': 'rotating your keys',
  'keys.recovery': 'making a new recovery kit',
  'mfa.remove': 'removing a sign-in factor',
  'mfa.regenerate': 'making new recovery codes',
  'audit.export': 'exporting the audit log',
}

type Ask = { action: StepUpAction; resolve: (token: string | null) => void }

/*
  FR-17. Any request that answers 403 STEP_UP_REQUIRED lands here (see
  setStepUpHandler in api/client): we ask for a fresh second factor, get a
  5-minute token bound to that one action, and the original request is sent
  again by itself. Tokens are reused per action until they run out, so
  revoking three links asks once.
*/
export function StepUpHost() {
  const email = useSession((s) => s.user?.email ?? '')
  const [queue, setQueue] = useState<Ask[]>([])
  const tokens = useRef(new Map<StepUpAction, { token: string; until: number }>())
  const waiting = useRef(new Map<StepUpAction, Promise<string | null>>())

  useEffect(() => {
    setStepUpHandler((action) => {
      // requests go out without a token first; a fresh one from earlier is reused as is
      const cached = tokens.current.get(action)
      if (cached && cached.until > Date.now()) return Promise.resolve(cached.token)
      let pending = waiting.current.get(action)
      if (!pending) {
        pending = new Promise<string | null>((resolve) =>
          setQueue((q) => [...q, { action, resolve }]),
        ).finally(() => waiting.current.delete(action))
        waiting.current.set(action, pending)
      }
      return pending
    })
    // a locked vault or a sign-out forgets every confirmation
    const unsubscribe = useSession.subscribe((s, prev) => {
      if (prev.privateKey && !s.privateKey) tokens.current.clear()
    })
    return () => {
      setStepUpHandler(null)
      unsubscribe()
    }
  }, [])

  const ask = queue[0]
  if (!ask) return null

  function finish(token: string | null) {
    ask.resolve(token)
    setQueue((q) => q.slice(1))
  }

  return (
    <StepUpDialog
      key={ask.action}
      action={ask.action}
      email={email}
      onDone={(token, expiresAt) => {
        tokens.current.set(ask.action, {
          token,
          until: new Date(expiresAt).getTime() - 15_000,
        })
        finish(token)
      }}
      onCancel={() => finish(null)}
    />
  )
}

function StepUpDialog({
  action,
  email,
  onDone,
  onCancel,
}: {
  action: StepUpAction
  email: string
  onDone: (token: string, expiresAt: string) => void
  onCancel: () => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm(value = code) {
    if (value.length !== 6 || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await authApi.stepUp({ action, method: 'totp', code: value })
      onDone(res.stepUpToken, res.expiresAt)
    } catch (err) {
      setError(errorMessage(err))
      setCode('')
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onCancel}
      dismissable={!busy}
      width={620}
      title="Confirm it is still you"
      subtitle={`step-up authentication · required for ${ACTION_TEXT[action]}`}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={code.length !== 6} onClick={() => confirm()}>
            Confirm
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <div className={styles.what}>
          <Icon name="shield" />
          <span>{ACTION_TEXT[action][0].toUpperCase() + ACTION_TEXT[action].slice(1)}</span>
          <Tag tone="warn">Elevated</Tag>
        </div>

        <div className={styles.factor}>
          <span className={styles.rings} aria-hidden>
            <Icon name="key" size={18} />
          </span>
          <p className={styles.factorTitle}>Enter the code from your authenticator app</p>
          <CodeInput
            label="Six-digit code"
            value={code}
            onChange={(v) => {
              setCode(v)
              setError('')
            }}
            onComplete={confirm}
            error={Boolean(error)}
            disabled={busy}
            autoFocus
          />
          {error && <p className={styles.error}>{error}</p>}
        </div>

        <MockAuthenticator
          email={email}
          onUseCode={(c) => {
            setCode(c)
            confirm(c)
          }}
        />

        <p className={styles.note}>
          Changing who can read something needs a fresh second factor, even inside an unlocked
          session. The confirmation is good for this kind of action for 5 minutes, and it is written
          to the audit chain either way.
        </p>
      </div>
    </Modal>
  )
}
