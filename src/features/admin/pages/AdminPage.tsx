import { useQuery } from '@tanstack/react-query'
import { Avatar, Button, Callout, PageHead, SectionMark, SkeletonRows, Tag } from '@/components'
import { adminApi, useAdminOverview, useAdminUsers } from '@/api/admin'
import { useCrumbs } from '@/hooks/useCrumbs'
import { useSession } from '@/store/session'
import { cx } from '@/utils/cx'
import { formatBytes, timeAgo } from '@/utils/format'
import { verifyChain } from '../auditChain'
import { ActivityChart } from '../components/ActivityChart'
import { UserActions } from '../components/UserActions'
import s from '@/features/settings/settings.module.css'
import styles from './AdminPage.module.css'

// figma 48. administrators only; an admin can remove people, never read their files
export default function AdminPage() {
  useCrumbs({ label: 'Admin', to: '/admin' }, 'Organisation')
  const me = useSession((st) => st.user)
  const isAdmin = me?.systemRole === 'admin'
  const overview = useAdminOverview(isAdmin)
  const users = useAdminUsers('', isAdmin)
  // the whole chain, recomputed here
  const chain = useQuery({
    queryKey: ['admin', 'chain'],
    queryFn: async () => verifyChain((await adminApi.audit({ pageSize: 2000 })).items, true),
    enabled: isAdmin,
  })

  if (!isAdmin) {
    return (
      <Callout tone="info" title="Administrators only">
        This page is for the organisation's administrators. Ask one if you need a member suspended
        or a role changed.
      </Callout>
    )
  }

  const o = overview.data
  const list = users.data?.items ?? []
  const mfaPct = o ? Math.round((o.security.mfaEnrolled / Math.max(1, o.accounts.total)) * 100) : 0

  return (
    <>
      <PageHead
        title="Organisation"
        meta={
          o
            ? `${o.accounts.total} accounts  ·  ${formatBytes(o.storage.usedBytes)} of ciphertext  ·  ${mfaPct}% MFA enrolled`
            : ' '
        }
        actions={
          <Button variant="ghost" icon="list" to="/audit">
            Audit log
          </Button>
        }
      />

      {overview.isPending && <SkeletonRows rows={4} />}

      {o && (
        <div className={cx(s.cards, styles.cards)}>
          <div className={s.card}>
            <span className={s.cardLabel}>MFA enrolment</span>
            <span className={cx(s.cardValue, mfaPct === 100 ? s.ok : s.warn)}>{mfaPct}%</span>
            <span className={s.cardSub}>
              {o.security.mfaEnrolled} of {o.accounts.total} accounts
            </span>
          </div>
          <div className={s.card}>
            <span className={s.cardLabel}>Pending key exchange</span>
            <span className={cx(s.cardValue, o.security.pendingKeyExchanges.length > 0 && s.warn)}>
              {o.security.pendingKeyExchanges.length}
            </span>
            <span className={s.cardSub}>
              {o.security.pendingKeyExchanges[0]
                ? `${o.security.pendingKeyExchanges[0].displayName} · ${o.security.pendingKeyExchanges[0].vaultName}`
                : 'nobody waiting'}
            </span>
          </div>
          <div className={s.card}>
            <span className={s.cardLabel}>Failed sign-ins, 7 d</span>
            <span className={s.cardValue}>{o.security.failedSignIns7d}</span>
            <span className={s.cardSub}>wrong password or second factor</span>
          </div>
          <div className={s.card}>
            <span className={s.cardLabel}>Audit chain</span>
            <span className={cx(s.cardValue, chain.data && (chain.data.ok ? s.ok : s.danger))}>
              {chain.isPending ? '…' : chain.data?.ok ? 'verified' : 'broken'}
            </span>
            <span className={s.cardSub}>
              {chain.data?.ok
                ? `${chain.data.checked} events, recomputed in this tab`
                : chain.data
                  ? `first break at #${chain.data.brokenAt}`
                  : 'recomputing'}
            </span>
          </div>
          <div className={s.card}>
            <span className={s.cardLabel}>Shares expiring, 14 d</span>
            <span className={cx(s.cardValue, o.security.sharesExpiring14d > 0 && s.warn)}>
              {o.security.sharesExpiring14d}
            </span>
            <span className={s.cardSub}>direct shares with an end date</span>
          </div>
        </div>
      )}

      {o && (
        <div className={styles.split}>
          <section className={s.section}>
            <SectionMark num="01">Activity, last 14 days</SectionMark>
            <ActivityChart days={o.activity} />
          </section>
          <section className={s.section}>
            <SectionMark num="02">Policy and health</SectionMark>
            <dl className={styles.policy}>
              <div>
                <dt>Second factor</dt>
                <dd>{o.policy.mfaRequired ? 'required for everyone' : 'optional'}</dd>
              </div>
              <div>
                <dt>Idle lock default</dt>
                <dd>{o.policy.idleLockMinutes} minutes</dd>
              </div>
              <div>
                <dt>Trash retention</dt>
                <dd>{o.policy.trashRetentionDays} days</dd>
              </div>
              <div>
                <dt>Longest secure link</dt>
                <dd>{o.policy.linkMaxDays} days</dd>
              </div>
              <div>
                <dt>API · database · storage</dt>
                <dd className={s.ok}>
                  {o.health.api} · {o.health.database} · {o.health.storage}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      )}

      <section className={cx(s.section, styles.members)}>
        <div className={s.sectionHead}>
          <SectionMark num="03">Members</SectionMark>
          <span className={s.sectionNote}>
            an admin can suspend a member, never read their files
          </span>
        </div>
        <div role="table" aria-label="Members" className="stack-rows with-menu">
          <div role="row" className={cx(styles.row, styles.head)}>
            <span role="columnheader">Member</span>
            <span role="columnheader">Role</span>
            <span role="columnheader">Key</span>
            <span role="columnheader">MFA</span>
            <span role="columnheader">Last active</span>
            <span role="columnheader" aria-label="Actions" />
          </div>
          {list.map((u) => (
            <div key={u.id} role="row" className={styles.row}>
              <span role="cell" className={styles.person}>
                <Avatar name={u.displayName} size={28} />
                <span>
                  {u.displayName}
                  {u.status === 'disabled' && <Tag tone="danger">Suspended</Tag>}
                </span>
              </span>
              <span role="cell">
                {u.systemRole === 'user'
                  ? 'Member'
                  : u.systemRole === 'admin'
                    ? 'Admin'
                    : 'Auditor'}
              </span>
              <span role="cell" className={styles.mono}>
                {u.fingerprint ? `${u.fingerprint.slice(0, 9)}…` : 'no key yet'}
              </span>
              <span role="cell" className={cx(styles.mono, u.mfa.length ? s.ok : s.warn)}>
                {u.mfa.length
                  ? u.mfa.map((m) => (m === 'totp' ? 'TOTP' : 'FIDO2')).join(' + ')
                  : 'not enrolled'}
              </span>
              <span role="cell" className={styles.mono}>
                {u.lastActiveAt ? timeAgo(u.lastActiveAt) : 'never'}
              </span>
              <span role="cell" className={styles.actions}>
                {u.id !== me?.id && (
                  <UserActions
                    userId={u.id}
                    name={u.displayName}
                    status={u.status}
                    systemRole={u.systemRole}
                  />
                )}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
