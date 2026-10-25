import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Avatar,
  Button,
  Callout,
  Icon,
  PageHead,
  SectionMark,
  Select,
  SkeletonRows,
  toast,
} from '@/components'
import { useVault, useVaultMembers, vaultKeys } from '@/api/vaults'
import { shareKeys, sharingApi, useInvitations } from '@/api/sharing'
import { errorMessage } from '@/api/client'
import type { MemberDto, VaultRole } from '@/api/types'
import { useCrumbs } from '@/hooks/useCrumbs'
import { useSession } from '@/store/session'
import { cx } from '@/utils/cx'
import { formatDate } from '@/utils/format'
import { InviteDialog } from '../components/InviteDialog'
import { PendingGrants } from '../components/PendingGrants'
import { RevokeDialog } from '../components/RevokeDialog'
import styles from './MembersPage.module.css'

const ROLE_OPTIONS = [
  { value: 'manager', label: 'Manager' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
]

// what the server enforces (and what key distribution makes true), row by row
const MATRIX: { what: string; who: string[] }[] = [
  { what: 'See that a file exists', who: ['owner', 'manager', 'editor', 'viewer', 'pending'] },
  { what: 'Decrypt and read contents', who: ['owner', 'manager', 'editor', 'viewer'] },
  { what: 'Upload new files and versions', who: ['owner', 'manager', 'editor'] },
  { what: 'Rename, move, move to trash', who: ['owner', 'manager', 'editor'] },
  { what: 'Share files and create secure links', who: ['owner', 'manager'] },
  { what: 'Invite members, change roles', who: ['owner', 'manager'] },
  { what: 'Revoke access and rotate keys', who: ['owner', 'manager'] },
  { what: 'Delete permanently from the trash', who: ['owner', 'manager'] },
  { what: 'Delete the vault', who: ['owner'] },
]
const COLUMNS = ['owner', 'manager', 'editor', 'viewer', 'pending']

// figma 23
export default function MembersPage() {
  const { vaultId } = useParams()
  const qc = useQueryClient()
  const me = useSession((s) => s.user)
  const vault = useVault(vaultId)
  const members = useVaultMembers(vaultId)
  const myRole = vault.data?.role
  const canManage = myRole === 'owner' || myRole === 'manager'
  const invitations = useInvitations(vaultId, canManage)
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<MemberDto | null>(null)

  useCrumbs(
    { label: 'Vaults', to: '/vaults' },
    vault.data ? { label: vault.data.name, to: `/vaults/${vaultId}` } : '…',
    'Members',
  )

  if (vault.isError) {
    return (
      <Callout tone="danger" title="This vault could not be opened">
        It may have been deleted, or you are no longer a member.
      </Callout>
    )
  }

  const list = members.data ?? []
  // a manager can't touch another manager or the owner
  const canEdit = (m: MemberDto) =>
    canManage &&
    m.userId !== me?.id &&
    m.role !== 'owner' &&
    (myRole === 'owner' || m.role !== 'manager')

  async function changeRole(m: MemberDto, role: VaultRole) {
    try {
      await sharingApi.changeRole(vaultId!, m.userId, role)
      toast(`${m.displayName} is now ${role === 'editor' ? 'an' : 'a'} ${role}.`, 'ok')
    } catch (err) {
      toast(errorMessage(err), 'danger')
    } finally {
      qc.invalidateQueries({ queryKey: vaultKeys.members(vaultId!) })
    }
  }

  async function cancelInvite(id: string) {
    try {
      await sharingApi.cancelInvitation(id)
      toast('Invitation cancelled. The link in the email no longer works.', 'ok')
    } catch (err) {
      toast(errorMessage(err), 'danger')
    } finally {
      qc.invalidateQueries({ queryKey: shareKeys.invitations(vaultId!) })
    }
  }

  return (
    <>
      <PageHead
        title="Members & roles"
        meta={
          vault.data
            ? `${vault.data.name}  ·  ${list.length} member${list.length === 1 ? '' : 's'}  ·  roles are enforced by who holds keys, not by UI state`
            : ' '
        }
        actions={
          canManage && (
            <Button icon="plus" onClick={() => setInviting(true)}>
              Invite
            </Button>
          )
        }
      />

      {canManage && <PendingGrants vaultId={vaultId} />}

      <SectionMark num="01" className={styles.mark}>
        Members
      </SectionMark>
      {members.isPending && <SkeletonRows rows={4} />}
      <ul className={styles.members}>
        {list.map((m) => (
          <li key={m.userId} className={styles.member}>
            <Avatar name={m.displayName} size={30} />
            <div className={styles.who}>
              <p>{m.displayName}</p>
              <span className={cx(m.status === 'pending' && styles.pending)}>
                {m.userId === me?.id
                  ? 'You'
                  : m.status === 'pending'
                    ? 'Awaiting key exchange'
                    : `${m.email} · key wrapped`}
              </span>
            </div>
            {canEdit(m) && (
              <Button variant="ghost" size="sm" onClick={() => setRemoving(m)}>
                Revoke
              </Button>
            )}
            {canEdit(m) ? (
              <Select
                compact
                aria-label={`Role for ${m.displayName}`}
                options={ROLE_OPTIONS.filter((o) => myRole === 'owner' || o.value !== 'manager')}
                value={m.role}
                onChange={(e) => changeRole(m, e.target.value as VaultRole)}
              />
            ) : (
              <span className={styles.role}>
                {m.status === 'pending' ? `${m.role} · pending` : m.role}
              </span>
            )}
          </li>
        ))}
      </ul>

      {canManage && (invitations.data?.length ?? 0) > 0 && (
        <>
          <SectionMark className={styles.mark}>Invitations not accepted yet</SectionMark>
          <ul className={styles.members}>
            {invitations.data!.map((i) => (
              <li key={i.id} className={styles.member}>
                <span className={styles.mail}>
                  <Icon name="bell" size={14} />
                </span>
                <div className={styles.who}>
                  <p>{i.email}</p>
                  <span>
                    {i.role} · invited by {i.invitedBy.displayName} · link works until{' '}
                    {formatDate(i.expiresAt)}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => cancelInvite(i.id)}>
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className={styles.matrixHead}>
        <SectionMark num="02">What each role can do</SectionMark>
        <span>a role is a set of wrapped keys plus what the server allows</span>
      </div>
      <div className={styles.matrixWrap}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th scope="col">Capability</th>
              {COLUMNS.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((row) => (
              <tr key={row.what}>
                <th scope="row">{row.what}</th>
                {COLUMNS.map((c) => (
                  <td key={c}>
                    {row.who.includes(c) ? (
                      <Icon name="check" size={14} label="yes" />
                    ) : (
                      <span aria-label="no">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>
        Changing a role changes what the server lets someone do; a viewer still holds keys and can
        still read. Removing someone deletes their wrapped keys, and rotating makes any key they
        kept useless for what's stored. Nothing can un-read what they already decrypted.
      </p>

      {inviting && vault.data && (
        <InviteDialog
          vaultId={vault.data.id}
          vaultName={vault.data.name}
          fileCount={vault.data.fileCount}
          isOwner={myRole === 'owner'}
          onClose={() => setInviting(false)}
        />
      )}
      {removing && vault.data && (
        <RevokeDialog
          mode="member"
          vaultId={vault.data.id}
          vaultName={vault.data.name}
          title={`Remove ${removing.displayName} from ${vault.data.name}`}
          people={[{ userId: removing.userId, displayName: removing.displayName }]}
          onClose={() => {
            setRemoving(null)
            qc.invalidateQueries({ queryKey: vaultKeys.members(vaultId!) })
          }}
        />
      )}
    </>
  )
}
