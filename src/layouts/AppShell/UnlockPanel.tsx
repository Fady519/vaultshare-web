import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Icon, SectionMark, TextField } from '@/components'
import { authApi } from '@/api/auth'
import { errorMessage } from '@/api/client'
import { DecryptError, passwordSecrets } from '@/crypto'
import { signOut, unlockWith } from '@/features/auth/session'
import { useSession } from '@/store/session'
import styles from './UnlockPanel.module.css'

/*
  The locked state (figma 51): the data is all there, the private key just
  isn't in memory on this device. Only the password is needed, the session is
  still valid so there is no second factor here.
*/
export function UnlockPanel() {
  const user = useSession((s) => s.user)
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user || !password) return
    setBusy(true)
    setError(null)
    try {
      const pre = await authApi.prelogin(user.email)
      const { wrapKey } = await passwordSecrets(password, pre.saltAuth, pre.saltWrap, pre.kdf)
      await unlockWith(wrapKey)
      setPassword('')
    } catch (err) {
      // a wrong password shows up as a failed decryption, because that's what it is
      setError(
        err instanceof DecryptError
          ? 'That password did not decrypt your private key. Nothing was sent to the server.'
          : errorMessage(err),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.panel}>
      <span className={styles.icon}>
        <Icon name="lock" size={20} />
      </span>
      <SectionMark>Vault locked</SectionMark>
      <h1 className={styles.title}>Your keys are not in memory</h1>
      <p className={styles.text}>
        Everything is still here and intact. This tab simply doesn&apos;t hold your private key
        right now — it was cleared after you were idle, or the page was reloaded. Enter your
        password to unwrap it again on this device.
      </p>

      <form className={styles.form} onSubmit={submit}>
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error ?? undefined}
          hint={
            busy
              ? 'Deriving your key · Argon2id 64 MiB · this takes about a second'
              : `Signed in as ${user?.email}`
          }
        />
        <div className={styles.actions}>
          <Button type="submit" loading={busy} disabled={!password}>
            Unlock
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await signOut()
              navigate('/signin')
            }}
          >
            Sign out
          </Button>
        </div>
      </form>
    </section>
  )
}
