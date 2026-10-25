import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar, Button, Callout, PageHead, Select, SkeletonRows, toast } from '@/components'
import { adminApi, useAudit, useTeam } from '@/api/admin'
import { errorMessage } from '@/api/client'
import { useFileIndex } from '@/api/files'
import { useVaults } from '@/api/vaults'
import type { AuditAction, AuditEntryDto } from '@/api/types'
import { useCrumbs } from '@/hooks/useCrumbs'
import { mocksOn, auditTamperState, toggleAuditTamper } from '@/mocks/devClient'
import { useSession } from '@/store/session'
import { cx } from '@/utils/cx'
import { downloadText } from '@/utils/download'
import { formatDate, formatTime } from '@/utils/format'
import { useFileNames } from '@/features/files/keys'
import { verifyChain, type ChainResult } from '../auditChain'
import helper from '@/features/auth/components/MockHelper.module.css'
import styles from './AuditLogPage.module.css'

const PAGE = 50

// red: something was refused or removed; amber: who-can-read changed; green: the rest
function toneOf(a: AuditAction) {
  if (/failed|revoke|purge|delete/.test(a)) return styles.bad
  if (/^(share|member|link|invite|keys|rekey|auth\.password|auth\.step_up|mfa)/.test(a))
    return styles.change
  return styles.fine
}

const ACTIONS: AuditAction[] = [
  'auth.login_failed',
  'auth.step_up',
  'auth.password',
  'mfa.add',
  'mfa.remove',
  'keys.rotate',
  'keys.recovery',
  'vault.create',
  'member.add',
  'member.role',
  'member.revoke',
  'invite.create',
  'invite.accept',
  'file.upload',
  'file.version',
  'file.download',
  'file.rename',
  'file.move',
  'file.trash',
  'file.restore',
  'file.purge',
  'share.grant',
  'share.change',
  'share.revoke',
  'link.create',
  'link.revoke',
  'link.download',
  'rekey.version',
  'session.revoke',
  'audit.export',
]

// figma 27
export default function AuditLogPage() {
  useCrumbs('Audit log')
  const qc = useQueryClient()
  const me = useSession((st) => st.user)
  const vaults = useVaults()
  const team = useTeam()
  const index = useFileIndex()
  const names = useFileNames(index.data)
  const full = me?.systemRole === 'admin' || me?.systemRole === 'auditor'
  const managed = (vaults.data ?? []).filter((v) => v.role === 'owner' || v.role === 'manager')

  const [scope, setScope] = useState('') // '' = everything (full) / my events
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const [check, setCheck] = useState<ChainResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [exporting, setExporting] = useState(false)

  const q = {
    vaultId: scope || undefined,
    action: (action || undefined) as AuditAction | undefined,
    page,
    pageSize: PAGE,
  }
  const audit = useAudit(q, Boolean(me))
  const items = audit.data?.items ?? []
  const pages = Math.max(1, Math.ceil((audit.data?.total ?? 0) / PAGE))

  useEffect(() => {
    setPage(1)
    setCheck(null)
  }, [scope, action])

  const scopes = [
    { value: '', label: full ? 'Every event (full chain)' : 'My own events' },
    ...(full ? (vaults.data ?? []) : managed).map((v) => ({ value: v.id, label: v.name })),
  ]
  const complete = full && !scope

  // what the resource id means to me: a file name I can decrypt, a vault, a person
  const resource = useMemo(() => {
    const vaultName = new Map((vaults.data ?? []).map((v) => [v.id, v.name]))
    const person = new Map((team.data ?? []).map((m) => [m.userId, m.displayName]))
    return (e: AuditEntryDto) => {
      if (e.resourceType === 'file')
        return names.data?.[e.resourceId] ?? `file ${e.resourceId.slice(0, 8)}…`
      if (e.resourceType === 'vault')
        return vaultName.get(e.resourceId) ?? `vault ${e.resourceId.slice(0, 8)}…`
      if (e.resourceType === 'user')
        return person.get(e.resourceId) ?? `account ${e.resourceId.slice(0, 8)}…`
      return `${e.resourceType} ${e.resourceId.slice(0, 8)}…`
    }
  }, [vaults.data, team.data, names.data])

  async function verify() {
    setChecking(true)
    try {
      const all = await adminApi.audit({ vaultId: scope || undefined, pageSize: 2000 })
      setCheck(await verifyChain(all.items, complete))
    } catch (err) {
      toast(errorMessage(err), 'danger')
    } finally {
      setChecking(false)
    }
  }

  async function exportLog() {
    setExporting(true)
    try {
      const res = await adminApi.exportAudit()
      const result = await verifyChain(res.entries, true)
      downloadText(
        `vaultshare-audit-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify({ ...res, verifiedInBrowser: result }, null, 2),
      )
      toast(
        res.signature
          ? 'Exported with the server signature.'
          : 'Exported. The mock server has no signing key, so the file carries the hashes only — anyone can re-verify them.',
        'ok',
      )
    } catch (err) {
      toast(errorMessage(err), 'danger')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHead
        title="Audit log"
        meta={`append-only  ·  hash-chained (SHA-256)  ·  ${complete ? 'full log' : scope ? 'one vault' : 'your own events'}  ·  ${audit.data?.total ?? '…'} events`}
        actions={
          <>
            <Button variant="ghost" icon="shield" loading={checking} onClick={verify}>
              Verify chain
            </Button>
            {full && (
              <Button variant="ghost" icon="down" loading={exporting} onClick={exportLog}>
                Export log
              </Button>
            )}
          </>
        }
      />

      <div className={styles.filters}>
        <Select
          compact
          aria-label="Scope"
          options={scopes}
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        />
        <Select
          compact
          aria-label="Event"
          options={[
            { value: '', label: 'Every kind of event' },
            ...ACTIONS.map((a) => ({ value: a, label: a })),
          ]}
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
      </div>

      {check &&
        (check.ok ? (
          <Callout tone="ok" icon="check" title="Chain verified in this tab">
            {check.checked} events recomputed with SHA-256
            {check.complete
              ? `, every link from the first entry to #${check.headSeq} (head ${check.headHash?.slice(0, 12)}…).`
              : '. This is a slice of the log, so each entry was checked on its own; links between entries need the full log (auditors and admins).'}
          </Callout>
        ) : (
          <Callout tone="danger" title={`Chain broken at #${check.brokenAt}`}>
            {check.reason === 'hash'
              ? 'That entry no longer matches its own hash: it was changed after it was written.'
              : check.reason === 'link'
                ? 'That entry does not point at the one before it: something was edited and re-hashed, or inserted.'
                : 'An entry is missing there: something was deleted.'}{' '}
            {check.checked} events before it are fine.
          </Callout>
        ))}

      {audit.isPending && <SkeletonRows rows={8} />}
      {audit.isError && (
        <Callout tone="danger" title="The log could not be loaded">
          {errorMessage(audit.error)}
        </Callout>
      )}

      {items.length > 0 && (
        <div role="table" aria-label="Audit log" className={cx(styles.table, 'stack-rows')}>
          <div role="row" className={cx(styles.row, styles.head)}>
            <span role="columnheader">#</span>
            <span role="columnheader">Time</span>
            <span role="columnheader">Event</span>
            <span role="columnheader">Actor</span>
            <span role="columnheader">Resource</span>
            <span role="columnheader">Hash</span>
          </div>
          {items.map((e) => (
            <div
              key={e.seq}
              role="row"
              className={cx(
                styles.row,
                check && !check.ok && check.brokenAt === e.seq && styles.broken,
              )}
            >
              <span role="cell" className={styles.mono}>
                {e.seq}
              </span>
              <span role="cell" className={styles.mono} title={e.timestamp}>
                {formatDate(e.timestamp).slice(0, 6)} {formatTime(e.timestamp)}
              </span>
              <span role="cell" className={styles.event}>
                <span className={cx(styles.dot, toneOf(e.action))} aria-hidden />
                <code>{e.action}</code>
              </span>
              <span role="cell" className={styles.actor}>
                {e.actorName ? (
                  <Avatar name={e.actorName} size={24} />
                ) : (
                  <span className={styles.system}>·</span>
                )}
                {e.actorName ?? 'system / anonymous'}
              </span>
              <span role="cell" className={styles.resource}>
                {resource(e)}
              </span>
              <span
                role="cell"
                className={styles.hash}
                title={`prev ${e.prevHash}\nhash ${e.hash}`}
              >
                {e.hash.slice(0, 8)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.pager}>
        <span>
          page {page} of {pages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Newer
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={page >= pages}
          onClick={() => setPage((p) => p + 1)}
        >
          Older
        </Button>
      </div>

      <p className={styles.note}>
        Each entry commits to the one before it. Changing, removing or inserting an entry breaks the
        chain from that point, and the check above runs entirely in your browser.
      </p>

      {mocksOn && (
        <AuditTamper
          onChange={() => {
            setCheck(null)
            qc.invalidateQueries({ queryKey: ['audit'] })
          }}
        />
      )}
    </>
  )
}

// dev only: what a database admin with write access might do to history
function AuditTamper({ onChange }: { onChange: () => void }) {
  const [seq, setSeq] = useState<number | null | undefined>(undefined)

  useEffect(() => {
    auditTamperState().then(setSeq)
  }, [])

  if (seq === undefined) return null
  return (
    <div role="note" className={cx(helper.box, styles.tamper)}>
      <span className={helper.tag}>Mock server · database</span>
      <p className={helper.text}>
        {seq
          ? `Entry #${seq} was edited in the database without fixing its hash. Run "Verify chain".`
          : 'Edit one entry in the middle of the log, the way someone with database access could.'}
      </p>
      <button
        type="button"
        className={helper.action}
        onClick={async () => {
          setSeq(await toggleAuditTamper())
          onChange()
        }}
      >
        {seq ? 'Undo the edit' : 'Tamper with an entry'}
      </button>
    </div>
  )
}
