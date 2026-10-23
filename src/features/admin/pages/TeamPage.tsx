import { useState } from 'react'
import { Avatar, Button, Callout, Modal, PageHead, Select, SkeletonRows, Tag } from '@/components'
import { useTeam } from '@/api/admin'
import { useVaults } from '@/api/vaults'
import type { TeamMemberDto } from '@/api/types'
import { useCrumbs } from '@/hooks/useCrumbs'
import { useSession } from '@/store/session'
import { cx } from '@/utils/cx'
import { downloadText } from '@/utils/download'
import { timeAgo } from '@/utils/format'
import { InviteDialog } from '@/features/sharing/components/InviteDialog'
import { UserActions } from '../components/UserActions'
import s from '@/features/settings/settings.module.css'
import styles from './TeamPage.module.css'

const ROLE_LABEL = { admin: 'Admin', auditor: 'Auditor', user: 'Member' } as const

function statusOf(m: TeamMemberDto) {
  if (m.status === 'disabled') return { text: 'Suspended', tone: styles.danger }
  if (m.status !== 'active') return { text: 'Setting up keys', tone: styles.warn }
  if (m.vaults.some((v) => v.status === 'pending'))
    return { text: 'Pending key', tone: styles.warn }
  return { text: 'Active', tone: styles.ok }
}

// figma 24: people who share at least one vault with me (an admin sees everyone)
export default function TeamPage() {
  useCrumbs('Team')
  const me = useSession((st) => st.user)
  const team = useTeam()
  const vaults = useVaults()
  const [inviting, setInviting] = useState(false)
  const list = team.data ?? []
  const isAdmin = me?.systemRole === 'admin'

  const pending = list.filter((m) => statusOf(m).text === 'Pending key').length
  const suspended = list.filter((m) => m.status === 'disabled').length
  const mfa = list.length
    ? Math.round((list.filter((m) => m.mfa.length).length / list.length) * 100)
    : 0
  const vaultCount = new Set(list.flatMap((m) => m.vaults.map((v) => v.vaultId))).size

  function exportCsv() {
    const rows = [
      ['name', 'email', 'role', 'status', 'vaults', 'mfa', 'last active'],
      ...list.map((m) => [
        m.displayName,
        m.email,
        ROLE_LABEL[m.systemRole],
        statusOf(m).text,
        m.vaults.map((v) => `${v.name} (${v.role})`).join('; '),
        m.mfa.join('+') || 'none',
        m.lastActiveAt ?? '',
      ]),
    ]
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    downloadText('vaultshare-team.csv', csv + '\n')
  }

  return (
    <>
      <PageHead
        title="Team"
        meta={
          team.data
            ? `${list.length} people  ·  ${pending} pending key exchange  ·  ${suspended} suspended  ·  ${isAdmin ? 'you see everyone (admin)' : 'people you share a vault with'}`
            : ' '
        }
        actions={
          <>
            <Button variant="ghost" icon="down" disabled={!list.length} onClick={exportCsv}>
              Export CSV
            </Button>
            <Button icon="plus" onClick={() => setInviting(true)}>
              Invite member
            </Button>
          </>
        }
      />

      <div className={cx(s.cards, styles.cards)}>
        <div className={s.card}>
          <span className={s.cardValue}>{list.length}</span>
          <span className={s.cardLabel}>Members</span>
        </div>
        <div className={s.card}>
          <span className={s.cardValue}>{vaultCount}</span>
          <span className={s.cardLabel}>Vaults</span>
        </div>
        <div className={s.card}>
          <span className={cx(s.cardValue, pending > 0 && s.warn)}>{pending}</span>
          <span className={s.cardLabel}>Pending key</span>
        </div>
        <div className={s.card}>
          <span className={cx(s.cardValue, suspended > 0 && s.danger)}>{suspended}</span>
          <span className={s.cardLabel}>Suspended</span>
        </div>
        <div className={s.card}>
          <span className={cx(s.cardValue, mfa === 100 && s.ok)}>{mfa}%</span>
          <span className={s.cardLabel}>MFA enrolled</span>
        </div>
      </div>

      {team.isPending && <SkeletonRows rows={5} />}

      {list.length > 0 && (
        <div role="table" aria-label="Team" className={styles.table}>
          <div role="row" className={cx(styles.row, styles.head)}>
            <span role="columnheader">Member</span>
            <span role="columnheader">Workspace role</span>
            <span role="columnheader">Vaults</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Last active</span>
            <span role="columnheader" aria-label="Actions" />
          </div>
          {list.map((m) => {
            const st = statusOf(m)
            return (
              <div key={m.userId} role="row" className={styles.row}>
                <span role="cell" className={styles.person}>
                  <Avatar name={m.displayName} size={30} />
                  <span>
                    <span className={styles.name}>
                      {m.displayName}
                      {m.userId === me?.id ? ' (you)' : ''}
                    </span>
                    <span className={styles.email}>{m.email}</span>
                  </span>
                </span>
                <span role="cell">
                  <Tag tone={m.systemRole === 'admin' ? 'accent' : 'neutral'}>
                    {ROLE_LABEL[m.systemRole]}
                  </Tag>
                </span>
                <span
                  role="cell"
                  className={styles.mono}
                  title={m.vaults.map((v) => `${v.name}: ${v.role}`).join('\n')}
                >
                  {m.vaults.length}
                </span>
                <span role="cell" className={cx(styles.status, st.tone)}>
                  <span className={styles.dot} aria-hidden />
                  {st.text}
                </span>
                <span role="cell" className={styles.mono}>
                  {m.lastActiveAt ? timeAgo(m.lastActiveAt) : 'never'}
                </span>
                <span role="cell" className={styles.actions}>
                  {isAdmin && m.userId !== me?.id && (
                    <UserActions
                      userId={m.userId}
                      name={m.displayName}
                      status={m.status}
                      systemRole={m.systemRole}
                    />
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <p className={styles.note}>
        Suspending someone revokes their sessions at once. Their wrapped key copies stay until they
        are removed from a vault — removal is a cryptographic event (keys deleted, optionally
        rotated), not a flag in a table.
      </p>

      {inviting && (
        <InvitePicker
          vaults={(vaults.data ?? []).filter((v) => v.role === 'owner' || v.role === 'manager')}
          onClose={() => setInviting(false)}
        />
      )}
    </>
  )
}

// invitations are per vault, so pick one first
function InvitePicker({
  vaults,
  onClose,
}: {
  vaults: { id: string; name: string; fileCount: number; role: string }[]
  onClose: () => void
}) {
  const [vaultId, setVaultId] = useState(vaults[0]?.id ?? '')
  const [chosen, setChosen] = useState(false)
  const v = vaults.find((x) => x.id === vaultId)

  if (chosen && v) {
    return (
      <InviteDialog
        vaultId={v.id}
        vaultName={v.name}
        fileCount={v.fileCount}
        isOwner={v.role === 'owner'}
        onClose={onClose}
      />
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title="Invite to which vault?"
      subtitle="access is always to a vault: its keys get wrapped for them"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!v} onClick={() => setChosen(true)}>
            Continue
          </Button>
        </>
      }
    >
      {vaults.length ? (
        <Select
          label="Vault"
          options={vaults.map((x) => ({ value: x.id, label: x.name }))}
          value={vaultId}
          onChange={(e) => setVaultId(e.target.value)}
        />
      ) : (
        <Callout tone="info">You need to own or manage a vault to invite people.</Callout>
      )}
    </Modal>
  )
}
