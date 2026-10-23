import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import {
  Button,
  Callout,
  CodeInput,
  Icon,
  Modal,
  SectionMark,
  Select,
  SkeletonRows,
  Tag,
  TextField,
  toast,
} from '@/components'
import { ApiError, errorMessage } from '@/api/client'
import { settingsApi, settingsKeys, useSecurityOverview, useSessions } from '@/api/settings'
import type { MfaFactorDto } from '@/api/types'
import { useSession } from '@/store/session'
import { downloadText } from '@/utils/download'
import { formatDate, timeAgo } from '@/utils/format'
import { updateUser } from '@/features/auth/session'
import { MockAuthenticator } from '@/features/auth/components/MockHelper'
import { SettingsLayout } from '../SettingsLayout'
import s from '../settings.module.css'
import styles from './SecurityPage.module.css'

const IDLE = [5, 15, 30, 60].map((m) => ({ value: String(m), label: `${m} minutes` }))

// figma 25
export default function SecurityPage() {
  const qc = useQueryClient()
  const user = useSession((st) => st.user)
  const overview = useSecurityOverview()
  const sessions = useSessions()
  const [adding, setAdding] = useState(false)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const o = overview.data
  const refresh = () => qc.invalidateQueries({ queryKey: settingsKeys.security })

  async function remove(f: MfaFactorDto) {
    setBusy(f.id)
    try {
      await settingsApi.removeFactor(f.id)
      toast(`${f.label} removed.`, 'ok')
    } catch (err) {
      toast(
        err instanceof ApiError && err.code === 'LAST_FACTOR'
          ? 'That is your only second factor. Add another one first.'
          : errorMessage(err),
        'danger',
      )
    } finally {
      setBusy(null)
      refresh()
    }
  }

  async function newCodes() {
    setBusy('codes')
    try {
      setCodes((await settingsApi.newRecoveryCodes()).codes)
      refresh()
    } catch (err) {
      toast(errorMessage(err), 'danger')
    } finally {
      setBusy(null)
    }
  }

  async function setIdle(minutes: number) {
    try {
      await settingsApi.setIdleLock(minutes)
      if (user) updateUser({ ...user, idleLockMinutes: minutes })
      useSession.getState().touch()
      toast(`The vault now locks after ${minutes} idle minutes.`, 'ok')
      refresh()
    } catch (err) {
      toast(errorMessage(err), 'danger')
    }
  }

  return (
    <SettingsLayout
      title="Security"
      crumb="Security"
      meta={
        o
          ? `${o.factors.length} second factor${o.factors.length === 1 ? '' : 's'}  ·  ${o.activeSessions} active session${o.activeSessions === 1 ? '' : 's'}  ·  private key sealed with Argon2id`
          : ' '
      }
      actions={
        <Button variant="ghost" icon="cog" to="/settings/keys">
          Rotate keys
        </Button>
      }
    >
      {overview.isPending && <SkeletonRows rows={4} />}

      {o && (
        <section className={s.section}>
          <div className={s.sectionHead}>
            <SectionMark num="01">Two-factor methods</SectionMark>
            <span className={s.sectionNote}>at least one is always required</span>
          </div>
          {o.factors.map((f) => (
            <div key={f.id} className={s.row}>
              <span className={s.rowIcon}>
                <Icon name={f.type === 'totp' ? 'key' : 'shield'} />
              </span>
              <div className={s.rowText}>
                <p className={s.rowTitle}>
                  {f.type === 'totp' ? 'Authenticator app' : 'Security key'}
                </p>
                <p className={s.rowSub}>
                  {f.label} · added {formatDate(f.createdAt)}
                  {f.lastUsedAt ? ` · last used ${timeAgo(f.lastUsedAt).toLowerCase()}` : ''}
                </p>
              </div>
              <Tag tone="accent">Active</Tag>
              <Button
                variant="ghost"
                size="sm"
                loading={busy === f.id}
                disabled={o.factors.length === 1}
                title={
                  o.factors.length === 1 ? 'Add another factor before removing this one' : undefined
                }
                onClick={() => remove(f)}
              >
                Remove
              </Button>
            </div>
          ))}
          <div className={s.row}>
            <span className={s.rowIcon}>
              <Icon name="list" />
            </span>
            <div className={s.rowText}>
              <p className={s.rowTitle}>Recovery codes</p>
              <p className={s.rowSub}>
                {o.recoveryCodesLeft} of 10 left · each works once, when you can't reach your
                authenticator
              </p>
            </div>
            <Tag tone={o.recoveryCodesLeft < 10 ? 'warn' : 'accent'}>
              {o.recoveryCodesLeft < 10 ? `${10 - o.recoveryCodesLeft} used` : 'Unused'}
            </Tag>
            <Button variant="ghost" size="sm" loading={busy === 'codes'} onClick={newCodes}>
              Make new codes
            </Button>
          </div>
          <div className={s.buttons}>
            <Button variant="ghost" icon="plus" onClick={() => setAdding(true)}>
              Add an authenticator app
            </Button>
          </div>
        </section>
      )}

      {o && (
        <section className={s.section}>
          <div className={s.sectionHead}>
            <SectionMark num="02">Idle lock</SectionMark>
            <span className={s.sectionNote}>your private key is wiped from memory after this</span>
          </div>
          <div className={s.row}>
            <div className={s.rowText}>
              <p className={s.rowTitle}>Lock after</p>
              <p className={s.rowSub}>
                Signing back in needs only your password; the session stays. Shorter is safer on
                shared computers.
              </p>
            </div>
            <Select
              compact
              aria-label="Idle lock"
              options={IDLE}
              value={String(o.idleLockMinutes)}
              onChange={(e) => setIdle(Number(e.target.value))}
            />
          </div>
        </section>
      )}

      <section className={s.section}>
        <div className={s.sectionHead}>
          <SectionMark num="03">Active sessions</SectionMark>
          <Button variant="ghost" size="sm" to="/settings/sessions">
            All sessions
          </Button>
        </div>
        {(sessions.data ?? []).slice(0, 3).map((x) => (
          <div key={x.id} className={s.row}>
            <div className={s.rowText}>
              <p className={s.rowTitle}>{x.current ? 'This session' : x.device}</p>
              <p className={s.rowSub}>
                {x.device} · {x.ipMasked} ·{' '}
                {x.current ? 'active now' : `last seen ${timeAgo(x.lastActiveAt).toLowerCase()}`}
              </p>
            </div>
            {x.current ? <Tag tone="accent">Current</Tag> : x.trusted ? <Tag>Trusted</Tag> : null}
          </div>
        ))}
      </section>

      {o && o.recentEvents.length > 0 && (
        <section className={s.section}>
          <SectionMark num="04">Recent security events</SectionMark>
          <ul className={styles.events}>
            {o.recentEvents.map((e) => (
              <li key={e.seq}>
                <code>{e.action}</code>
                <span>{timeAgo(e.timestamp)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={s.note}>
        Revoking a device or session can't decrypt or delete anything retroactively — it stops new
        tokens. Rotate your keys if you think a private key was exposed.
      </p>

      {adding && user && (
        <AddAuthenticator
          email={user.email}
          onClose={() => {
            setAdding(false)
            refresh()
          }}
        />
      )}
      {codes && <NewCodes codes={codes} onClose={() => setCodes(null)} />}
    </SettingsLayout>
  )
}

function AddAuthenticator({ email, onClose }: { email: string; onClose: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null)
  const [label, setLabel] = useState('Second phone')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    settingsApi
      .totpSetup()
      .then(async (res) =>
        setSetup({
          secret: res.secret,
          qr: await QRCode.toDataURL(res.otpauthUri, { width: 172, margin: 1 }),
        }),
      )
      .catch((err) => setError(errorMessage(err)))
  }, [])

  async function confirm(value = code) {
    if (value.length !== 6) return
    setBusy(true)
    setError('')
    try {
      await settingsApi.totpConfirm(value, label.trim() || 'Authenticator app')
      toast('Authenticator added.', 'ok')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setCode('')
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={600}
      title="Add an authenticator app"
      subtitle="a second one, e.g. on a backup phone"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={code.length !== 6} onClick={() => confirm()}>
            Add
          </Button>
        </>
      }
    >
      <div className={styles.add}>
        {setup ? (
          <div className={styles.qr}>
            <img
              src={setup.qr}
              alt="QR code to scan with the authenticator app"
              width={172}
              height={172}
            />
            <div>
              <p className={s.rowSub}>Can't scan? Type this secret:</p>
              <code className={styles.secret}>{setup.secret.match(/.{1,4}/g)?.join(' ')}</code>
            </div>
          </div>
        ) : (
          !error && <SkeletonRows rows={2} />
        )}
        <TextField label="Name it" value={label} onChange={(e) => setLabel(e.target.value)} />
        <CodeInput
          label="Code from the app"
          value={code}
          onChange={setCode}
          onComplete={confirm}
          error={Boolean(error)}
        />
        {error && <p className={styles.error}>{error}</p>}
        <MockAuthenticator
          email={email}
          onUseCode={(c) => {
            setCode(c)
            confirm(c)
          }}
        />
      </div>
    </Modal>
  )
}

function NewCodes({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title="Your new recovery codes"
      subtitle="the old ten stopped working just now"
      footer={
        <>
          <Button
            variant="ghost"
            icon="down"
            onClick={() =>
              downloadText(
                'vaultshare-recovery-codes.txt',
                `VaultShare recovery codes\nEach works once.\n\n${codes.join('\n')}\n`,
              )
            }
          >
            Download
          </Button>
          <Button onClick={onClose}>I stored them</Button>
        </>
      }
    >
      <ol className={styles.codes} aria-label="Recovery codes">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ol>
      <Callout tone="warn">
        They are shown once. The server keeps only a hash of each, so nobody can show them to you
        again.
      </Callout>
    </Modal>
  )
}
