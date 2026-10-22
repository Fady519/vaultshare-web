import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar, Button, Callout, Checkbox, SectionMark, Skeleton } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { useInvitation } from '@/api/auth'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import { useSession } from '@/store/session'
import { acceptPendingInvite, rememberInvite } from '../session'
import s from '../auth.module.css'
import styles from './AcceptInvitePage.module.css'

export default function AcceptInvitePage() {
  useDocumentTitle('Join a vault')
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const invite = useInvitation(token)
  const signedIn = useSession((st) => st.user?.status === 'active')
  const [haveAccount, setHaveAccount] = useState(signedIn)
  const [busy, setBusy] = useState(false)

  async function accept() {
    rememberInvite(token)
    if (signedIn) {
      setBusy(true)
      await acceptPendingInvite()
      navigate('/vaults')
    } else if (haveAccount) {
      navigate('/signin')
    } else {
      navigate(`/signup?invite=${encodeURIComponent(token)}`)
    }
  }

  const inv = invite.data
  const first = inv?.inviterName.split(' ')[0] ?? 'The inviter'

  return (
    <StepCard
      width={780}
      footer={
        inv && (
          <>
            <Button variant="ghost" size="lg" to="/">
              Decline
            </Button>
            <Button size="lg" loading={busy} onClick={accept}>
              Accept and exchange keys
            </Button>
          </>
        )
      }
    >
      <SectionMark num="33">Invitation</SectionMark>
      <h1 className={s.title}>Join a vault</h1>
      <p className={s.lead}>
        Accepting an invitation is a key exchange, not a permission grant. Nothing is readable until
        your key is wrapped in.
      </p>

      {invite.isPending && <Skeleton height={96} />}

      {invite.isError && (
        <Callout tone="warn" title="This invitation is no longer valid">
          It may have expired, been cancelled, or already been used. Ask the person who invited you
          to send a new one.
        </Callout>
      )}

      {inv && (
        <>
          <div className={styles.from}>
            <Avatar name={inv.inviterName} size={44} />
            <div>
              <p className={styles.who}>
                {inv.inviterName} invited you to {inv.vaultName}
              </p>
              <p className={s.mono}>
                {inv.fileCount} files · {inv.memberCount} members · role offered: {inv.role}
              </p>
            </div>
          </div>

          <SectionMark num="01">What happens when you accept</SectionMark>
          <ol className={styles.steps}>
            <li>
              <span className={styles.n}>01</span>
              Your browser generates or unlocks your RSA-4096 key pair
              <span className={styles.where}>local</span>
            </li>
            <li>
              <span className={styles.n}>02</span>
              {first}&apos;s client re-wraps each data key to your public key
              <span className={styles.where}>their device</span>
            </li>
            <li>
              <span className={styles.n}>03</span>
              You receive wrapped key blobs, never a plaintext key
              <span className={styles.where}>server relay</span>
            </li>
          </ol>

          {!signedIn && (
            <Checkbox
              checked={haveAccount}
              onChange={(e) => setHaveAccount(e.target.checked)}
              label="I already have a VaultShare account"
              sub={`It has to be ${inv.email}, the address this invite was sent to.`}
            />
          )}
        </>
      )}
    </StepCard>
  )
}
