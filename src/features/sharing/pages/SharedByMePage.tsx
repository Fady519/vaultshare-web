import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  AvatarStack,
  Button,
  Callout,
  EmptyState,
  FileKindBox,
  PageHead,
  SkeletonRows,
  Tag,
  Toggle,
  toast,
} from '@/components'
import { useFileIndex } from '@/api/files'
import { errorMessage } from '@/api/client'
import { shareKeys, sharingApi, useMyLinks, useOutgoingShares } from '@/api/sharing'
import type { FileDto, LinkDto, OutgoingShare } from '@/api/types'
import { useCrumbs } from '@/hooks/useCrumbs'
import { cx } from '@/utils/cx'
import { formatDate } from '@/utils/format'
import { useFileNames } from '@/features/files/keys'
import { RevokeDialog } from '../components/RevokeDialog'
import { SecureLinkDialog } from '../components/SecureLinkDialog'
import { expiryLevel } from '../expiry'
import styles from './SharedPages.module.css'

type Row = { file: FileDto; shares: OutgoingShare[]; links: LinkDto[] }

const live = (l: LinkDto) => !l.revoked && l.expiresAt > new Date().toISOString()

// figma 18: one row per file, whether it went out as a direct share, a secure link or both
export default function SharedByMePage() {
  useCrumbs('Shared by me')
  const qc = useQueryClient()
  const navigate = useNavigate()
  const outgoing = useOutgoingShares()
  const links = useMyLinks()
  const index = useFileIndex()
  const [revoking, setRevoking] = useState<Row | null>(null)
  const [linking, setLinking] = useState<FileDto | null>(null)
  const [busy, setBusy] = useState(false)

  const rows = useMemo(() => {
    const byFile = new Map<string, Row>()
    for (const s of outgoing.data ?? []) {
      const row = byFile.get(s.file.id) ?? { file: s.file, shares: [], links: [] }
      row.shares.push(s)
      byFile.set(s.file.id, row)
    }
    for (const l of (links.data ?? []).filter(live)) {
      const file = byFile.get(l.fileId)?.file ?? index.data?.find((f) => f.id === l.fileId)
      if (!file) continue
      const row = byFile.get(l.fileId) ?? { file, shares: [], links: [] }
      row.links.push(l)
      byFile.set(l.fileId, row)
    }
    return [...byFile.values()]
  }, [outgoing.data, links.data, index.data])

  const names = useFileNames(rows.map((r) => r.file))
  const nameOf = (f: FileDto) => names.data?.[f.id] ?? '…'
  const copies = rows.reduce((n, r) => n + r.shares.length, 0)
  const activeLinks = rows.flatMap((r) => r.links)

  async function revokeLinks(list: LinkDto[], label: string) {
    setBusy(true)
    try {
      for (const l of list) await sharingApi.revokeLink(l.id)
      toast(`${label}: the sealed key copies are gone.`, 'ok')
    } catch (err) {
      toast(errorMessage(err), 'danger')
    } finally {
      setBusy(false)
      qc.invalidateQueries({ queryKey: shareKeys.links })
    }
  }

  const loading = outgoing.isPending || links.isPending

  return (
    <>
      <PageHead
        title="Shared by me"
        meta={
          loading
            ? ' '
            : `${rows.length} file${rows.length === 1 ? '' : 's'}  ·  ${copies} wrapped key ${copies === 1 ? 'copy' : 'copies'} outstanding  ·  ${activeLinks.length} live link${activeLinks.length === 1 ? '' : 's'}  ·  revoking deletes the copy, not the file`
        }
        actions={
          <Button
            variant="ghost"
            loading={busy}
            disabled={activeLinks.length === 0}
            onClick={() => revokeLinks(activeLinks, 'All links revoked')}
          >
            Revoke all links
          </Button>
        }
      />

      {loading && <SkeletonRows rows={5} />}
      {(outgoing.isError || links.isError) && (
        <Callout tone="danger" title="Your shares could not be loaded">
          Try again in a moment.
        </Callout>
      )}
      {!loading && rows.length === 0 && (
        <EmptyState icon="share" title="You haven't shared anything yet">
          Share a file from its menu in a vault: with a person (their own wrapped key) or with a
          secure link (the key rides in the link, after the #).
        </EmptyState>
      )}

      {rows.length > 0 && (
        <div role="table" aria-label="Shared by me" className={cx(styles.table, 'stack-rows')}>
          <div role="row" className={cx(styles.row, styles.byMe, styles.head)}>
            <span role="columnheader">File</span>
            <span role="columnheader">Shared with</span>
            <span role="columnheader">Role</span>
            <span role="columnheader">Secure link</span>
            <span role="columnheader">Access expires</span>
            <span role="columnheader" aria-label="Actions" />
          </div>
          {rows.map((r) => {
            const name = nameOf(r.file)
            const roles = [...new Set(r.shares.map((s) => s.role))]
            // the earliest of the shares' and links' expiry dates
            const soonest = [
              ...r.shares.map((s) => s.expiresAt),
              ...r.links.map((l) => l.expiresAt),
            ]
              .filter((e): e is string => e !== null)
              .sort()[0]
            return (
              <div key={r.file.id} role="row" className={cx(styles.row, styles.byMe)}>
                <span role="cell" className={styles.file}>
                  <FileKindBox mimeType={r.file.mimeType} name={name} />
                  <span className={styles.names}>
                    <button type="button" onClick={() => navigate(`/files/${r.file.id}`)}>
                      {name}
                    </button>
                    <span>
                      {r.shares.length} wrapped key {r.shares.length === 1 ? 'copy' : 'copies'} ·{' '}
                      {r.file.vaultName}
                    </span>
                  </span>
                </span>
                <span role="cell">
                  {r.shares.length ? (
                    <AvatarStack
                      people={r.shares.map((s) => ({
                        userId: s.recipient.id,
                        displayName: s.recipient.displayName,
                      }))}
                    />
                  ) : (
                    <span className={styles.mono}>link only</span>
                  )}
                </span>
                <span role="cell">
                  {roles.length === 1 ? (
                    <Tag tone={roles[0] === 'editor' ? 'accent' : 'neutral'}>{roles[0]}</Tag>
                  ) : roles.length > 1 ? (
                    <Tag>mixed</Tag>
                  ) : (
                    <span className={styles.mono}>—</span>
                  )}
                </span>
                <span role="cell" className={cx(styles.link, r.links.length > 0 && styles.on)}>
                  <Toggle
                    label={`Secure link for ${name}`}
                    checked={r.links.length > 0}
                    disabled={busy}
                    onChange={(on) =>
                      on ? setLinking(r.file) : revokeLinks(r.links, `Link to ${name} revoked`)
                    }
                  />
                  {r.links.length > 0 ? 'on' : 'off'}
                </span>
                <span
                  role="cell"
                  className={cx(styles.expiry, styles[expiryLevel(soonest ?? null)])}
                >
                  <span className={styles.dot} aria-hidden />
                  {soonest ? formatDate(soonest) : 'No expiry'}
                </span>
                <span role="cell" className={styles.actions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={r.shares.length === 0}
                    onClick={() => setRevoking(r)}
                  >
                    Revoke
                  </Button>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {rows.length > 0 && (
        <p className={styles.note}>
          Revoking deletes the wrapped key copies straight away, and can rotate the file's keys too.
          It cannot un-read what someone already decrypted.
        </p>
      )}

      {revoking && (
        <RevokeDialog
          mode="share"
          fileId={revoking.file.id}
          title={`Revoke access to ${nameOf(revoking.file)}`}
          people={revoking.shares.map((s) => ({
            userId: s.recipient.id,
            displayName: s.recipient.displayName,
          }))}
          onClose={() => setRevoking(null)}
        />
      )}
      {linking && (
        <SecureLinkDialog file={linking} name={nameOf(linking)} onClose={() => setLinking(null)} />
      )}
    </>
  )
}
