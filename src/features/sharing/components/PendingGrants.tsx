import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar, Button, toast } from '@/components'
import { errorMessage } from '@/api/client'
import { shareKeys, usePendingGrants } from '@/api/sharing'
import { vaultKeys } from '@/api/vaults'
import { fileKeys } from '@/api/files'
import type { PendingGrantDto } from '@/api/types'
import { completeGrant } from '../engine'
import styles from './PendingGrants.module.css'

/*
  People who accepted an invitation and finished their key ceremony, but
  can't read anything yet: their keys need wrapping by someone who already
  holds them. Shown to owners and managers on the vault and members pages.
*/
export function PendingGrants({ vaultId }: { vaultId?: string }) {
  const qc = useQueryClient()
  const grants = usePendingGrants()
  const [busy, setBusy] = useState<Record<string, string>>({})

  const list = (grants.data ?? []).filter((g) => !vaultId || g.vaultId === vaultId)
  if (list.length === 0) return null

  async function complete(g: PendingGrantDto) {
    const id = g.invitationId
    setBusy((b) => ({ ...b, [id]: 'starting' }))
    try {
      await completeGrant(g, (n) =>
        setBusy((b) => ({ ...b, [id]: `${n} of ${g.versions.length}` })),
      )
      toast(`${g.recipient.displayName} can open ${g.vaultName} now.`, 'ok')
    } catch (err) {
      toast(errorMessage(err), 'danger')
    } finally {
      setBusy((b) => {
        const next = { ...b }
        delete next[id]
        return next
      })
      qc.invalidateQueries({ queryKey: shareKeys.grants })
      qc.invalidateQueries({ queryKey: vaultKeys.all })
      qc.invalidateQueries({ queryKey: fileKeys.all })
    }
  }

  return (
    <section className={styles.box} aria-label="Waiting for keys">
      <p className={styles.title}>
        {list.length === 1 ? 'Someone is' : `${list.length} people are`} waiting for their keys
      </p>
      <ul>
        {list.map((g) => (
          <li key={g.invitationId} className={styles.row}>
            <Avatar name={g.recipient.displayName} size={28} />
            <div className={styles.who}>
              <p>
                {g.recipient.displayName} · {g.role}
                {vaultId ? '' : ` in ${g.vaultName}`}
              </p>
              <span>
                {g.recipient.email} · key {g.recipient.fingerprint.split(' ').slice(0, 4).join(' ')}
              </span>
            </div>
            <Button
              size="sm"
              icon="key"
              loading={Boolean(busy[g.invitationId])}
              onClick={() => complete(g)}
            >
              {busy[g.invitationId]
                ? `Wrapping ${busy[g.invitationId]}`
                : `Wrap ${g.versions.length} keys`}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
