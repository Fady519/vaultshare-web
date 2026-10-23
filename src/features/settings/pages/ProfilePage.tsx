import { useState, type FormEvent } from 'react'
import { Avatar, Button, Callout, Checkbox, SectionMark, TextField, toast } from '@/components'
import { api, ApiError, errorMessage } from '@/api/client'
import { authApi } from '@/api/auth'
import { settingsApi, useMyKeys } from '@/api/settings'
import type { UserDto } from '@/api/types'
import { changePasswordSecrets, DecryptError } from '@/crypto'
import { useSession } from '@/store/session'
import { formatDate } from '@/utils/format'
import { passwordStrength } from '@/utils/passwordStrength'
import { updateUser } from '@/features/auth/session'
import { StrengthMeter } from '@/features/auth/components/StrengthMeter'
import { SettingsLayout } from '../SettingsLayout'
import s from '../settings.module.css'
import styles from './ProfilePage.module.css'

// figma 26
export default function ProfilePage() {
  const user = useSession((st) => st.user)
  const keys = useMyKeys()

  return (
    <SettingsLayout
      title="Settings"
      crumb="Profile"
      meta={
        user
          ? `${user.email}  ·  ${user.systemRole}  ·  member since ${formatDate(user.createdAt)}`
          : ' '
      }
    >
      {user && <Identity user={user} fingerprint={keys.data?.fingerprint} />}
      {user && <ChangePassword user={user} />}
    </SettingsLayout>
  )
}

function Identity({ user, fingerprint }: { user: UserDto; fingerprint?: string }) {
  const [name, setName] = useState(user.displayName)
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      updateUser(await api.patch<UserDto>('/me', { displayName: name.trim() }))
      toast('Name saved.', 'ok')
    } catch (err) {
      toast(errorMessage(err), 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={s.form} onSubmit={save}>
      <SectionMark num="01">Identity</SectionMark>
      <div className={styles.identity}>
        <Avatar name={user.displayName} size={44} />
        <div>
          <p className={styles.name}>{user.displayName}</p>
          <p className={s.note}>
            {user.email}
            {fingerprint ? ` · key ${fingerprint}` : ''}
          </p>
        </div>
      </div>
      <div className={s.pair}>
        <TextField
          label="Display name"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          hint="Shown to people you share with. This one is plain text, like the vault names."
        />
        <TextField
          label="Email"
          value={user.email}
          readOnly
          hint="Verified. It can't be changed in this version."
        />
      </div>
      <div className={s.buttons}>
        <Button type="submit" loading={busy} disabled={name.trim() === user.displayName}>
          Save name
        </Button>
      </div>
    </form>
  )
}

/*
  The private key in memory can't be exported (on purpose), so the stored
  sealed copy is opened with the current password and sealed again under the
  new one, here. The server gets proof of the old password and the new blob.
*/
function ChangePassword({ user }: { user: UserDto }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [signOutOthers, setSignOutOthers] = useState(true)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const strength = passwordStrength(next, user.email)

  async function save(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!current) errs.current = 'Enter your current password.'
    if (!strength.acceptable) errs.next = strength.hint ?? 'Choose a stronger password.'
    if (next === current) errs.next = 'Pick a password you have not used here.'
    if (confirm !== next) errs.confirm = 'The two new passwords are different.'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setBusy(true)
    try {
      const [salts, keys] = await Promise.all([authApi.prelogin(user.email), settingsApi.myKeys()])
      const body = await changePasswordSecrets(current, salts, keys.sealedPrivateKey, next)
      await settingsApi.changePassword({ ...body, signOutOthers })
      setCurrent('')
      setNext('')
      setConfirm('')
      toast(
        signOutOthers
          ? 'Password changed. Every other session was signed out.'
          : 'Password changed.',
        'ok',
      )
    } catch (err) {
      if (
        err instanceof DecryptError ||
        (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS')
      ) {
        setErrors({ current: 'That is not your current password.' })
      } else {
        toast(errorMessage(err), 'danger')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={s.form} onSubmit={save} noValidate>
      <div className={s.sectionHead}>
        <SectionMark num="02">Change password</SectionMark>
        <span className={s.sectionNote}>re-seals your private key, never uploads it</span>
      </div>
      <TextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={current}
        error={errors.current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <div className={s.pair}>
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          error={errors.next}
          valid={strength.acceptable && !errors.next}
          onChange={(e) => setNext(e.target.value)}
          hint="Argon2id · m=64 MiB, t=3, p=4"
        />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          valid={Boolean(confirm) && confirm === next}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {next && <StrengthMeter strength={strength} />}
      <Checkbox
        checked={signOutOthers}
        onChange={(e) => setSignOutOthers(e.target.checked)}
        label="Sign out every other session"
        sub="Their refresh tokens are revoked and those devices have to sign in again."
      />
      <Callout tone="warn">
        Changing your password re-encrypts the key that unlocks your files. It never travels — the
        whole operation happens in this tab. Your recovery kit keeps working.
      </Callout>
      <div className={s.buttons}>
        <Button type="submit" loading={busy}>
          Change password
        </Button>
      </div>
    </form>
  )
}
