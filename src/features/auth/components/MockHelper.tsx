import { useEffect, useState } from 'react'
import type { MockMail } from '@/mocks/db'
import { fetchOutbox, fetchTotp, mocksOn } from '@/mocks/devClient'
import styles from './MockHelper.module.css'

/*
  Dev only. With the mock server there is no real mailbox and no phone, so these
  panels show what the "server" sent / what an authenticator app would show.
  They don't render at all when VITE_USE_MOCKS is false.
*/

export function MockInbox({
  email,
  onUseCode,
}: {
  email: string
  onUseCode?: (code: string) => void
}) {
  const [mail, setMail] = useState<MockMail | null>(null)

  useEffect(() => {
    if (!mocksOn || !email) return
    let alive = true
    // the newest mail that carries a code or a link is the useful one
    const poll = () =>
      fetchOutbox(email).then(
        (list) => alive && setMail(list.find((m) => m.code || m.link) ?? list[0] ?? null),
      )
    poll()
    const t = setInterval(poll, 2000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [email])

  if (!mocksOn) return null

  return (
    <div role="note" className={styles.box}>
      <span className={styles.tag}>Mock server · inbox of {email || '…'}</span>
      {!mail && <p className={styles.text}>No email yet.</p>}
      {mail && (
        <>
          <p className={styles.subject}>{mail.subject}</p>
          <p className={styles.text}>{mail.body}</p>
          {mail.code && (
            <button type="button" className={styles.action} onClick={() => onUseCode?.(mail.code!)}>
              Use code {mail.code}
            </button>
          )}
          {mail.link && (
            <a className={styles.action} href={mail.link}>
              Open the link
            </a>
          )}
        </>
      )}
    </div>
  )
}

export function MockAuthenticator({
  email,
  onUseCode,
}: {
  email: string
  onUseCode: (code: string) => void
}) {
  const [state, setState] = useState<{ code: string | null; secondsLeft: number }>({
    code: null,
    secondsLeft: 0,
  })

  useEffect(() => {
    if (!mocksOn || !email) return
    let alive = true
    const poll = () => fetchTotp(email).then((s) => alive && setState(s))
    poll()
    const t = setInterval(poll, 1000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [email])

  if (!mocksOn || !state.code) return null

  return (
    <div role="note" className={styles.box}>
      <span className={styles.tag}>Mock server · what your authenticator app shows</span>
      <p className={styles.subject}>
        <span className={styles.code}>{state.code}</span> · changes in {state.secondsLeft}s
      </p>
      <button type="button" className={styles.action} onClick={() => onUseCode(state.code!)}>
        Fill it in
      </button>
    </div>
  )
}
