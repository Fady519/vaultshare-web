import { useState } from 'react'
import {
  Button,
  Callout,
  EmptyState,
  FileKindBox,
  Icon,
  Menu,
  PageHead,
  SkeletonRows,
  toast,
} from '@/components'
import { filesApi, useTrash } from '@/api/files'
import { useVaults } from '@/api/vaults'
import { errorMessage } from '@/api/client'
import type { FileDto } from '@/api/types'
import { useCrumbs } from '@/hooks/useCrumbs'
import { cx } from '@/utils/cx'
import { formatBytes, formatWhen, shortName } from '@/utils/format'
import { useFileNames } from '@/features/files/keys'
import { refreshFiles } from '@/features/files/actions'
import { PurgeDialog } from '@/features/files/components/PurgeDialog'
import styles from './TrashPage.module.css'

const DAY = 86_400_000

function daysLeft(purgeAt: string | null) {
  if (!purgeAt) return 0
  return Math.max(0, Math.ceil((new Date(purgeAt).getTime() - Date.now()) / DAY))
}

// figma 22
export default function TrashPage() {
  useCrumbs('Trash')
  const trash = useTrash()
  const vaults = useVaults()
  const names = useFileNames(trash.data)
  const [purging, setPurging] = useState<
    { mode: 'one'; file: FileDto; name: string } | { mode: 'all' } | null
  >(null)
  const [busy, setBusy] = useState<string | null>(null)

  const roleIn = new Map((vaults.data ?? []).map((v) => [v.id, v.role]))
  const canRestore = (f: FileDto) => roleIn.get(f.vaultId) !== 'viewer'
  const canPurge = (f: FileDto) => ['owner', 'manager'].includes(roleIn.get(f.vaultId) ?? '')

  const items = trash.data ?? []
  const retention =
    items[0]?.deletedAt && items[0].purgeAt
      ? Math.round(
          (new Date(items[0].purgeAt).getTime() - new Date(items[0].deletedAt).getTime()) / DAY,
        )
      : 30

  async function restore(ids: string[], label: string) {
    setBusy(ids.length === 1 ? ids[0] : 'all')
    try {
      const res = await filesApi.bulk('restore', ids)
      toast(
        res.failed.length
          ? `${res.done.length} restored, ${res.failed.length} need an editor of their vault.`
          : `${label} restored to ${ids.length === 1 ? 'its vault' : 'their vaults'}.`,
        res.failed.length ? 'warn' : 'ok',
      )
    } catch (err) {
      toast(errorMessage(err), 'danger')
    } finally {
      setBusy(null)
      refreshFiles()
    }
  }

  return (
    <>
      <PageHead
        title="Trash"
        meta={`${items.length} item${items.length === 1 ? '' : 's'}  ·  ${retention}-day retention  ·  keys are shredded before the ciphertext is`}
        actions={
          <>
            <Button
              variant="ghost"
              disabled={!items.some(canRestore)}
              loading={busy === 'all'}
              onClick={() =>
                restore(
                  items.filter(canRestore).map((f) => f.id),
                  'Everything',
                )
              }
            >
              Restore all
            </Button>
            <Button
              variant="danger"
              disabled={!items.some(canPurge)}
              onClick={() => setPurging({ mode: 'all' })}
            >
              Empty trash
            </Button>
          </>
        }
      />

      {items.length > 0 && (
        <Callout tone="warn" className={styles.callout}>
          Emptying the trash destroys the wrapped data keys first. After that the stored bytes are
          unrecoverable by anyone, including us — there is no support ticket that undoes it.
        </Callout>
      )}

      {trash.isPending && <SkeletonRows rows={5} />}
      {trash.isError && (
        <Callout tone="danger" title="The trash could not be loaded">
          Try again in a moment.
        </Callout>
      )}
      {trash.isSuccess && items.length === 0 && (
        <EmptyState icon="trash" title="Trash is empty">
          Deleted files wait here for {retention} days before they are destroyed, so a mistake can
          still be undone.
        </EmptyState>
      )}

      {items.length > 0 && (
        <div role="table" aria-label="Trash" className={cx(styles.table, 'stack-rows')}>
          <div role="row" className={cx(styles.row, styles.head)}>
            <span role="columnheader">File</span>
            <span role="columnheader">Size</span>
            <span role="columnheader">Deleted by</span>
            <span role="columnheader">Deleted</span>
            <span role="columnheader">Purges in</span>
            <span role="columnheader" aria-label="Actions" />
          </div>
          {items.map((f) => {
            const name = names.data?.[f.id] ?? '…'
            const left = daysLeft(f.purgeAt)
            return (
              <div key={f.id} role="row" className={styles.row}>
                <span role="cell" className={styles.file}>
                  <FileKindBox mimeType={f.mimeType} name={name} />
                  <span className={styles.names}>
                    <span className={styles.name}>{name}</span>
                    <span className={styles.sub}>
                      still encrypted · {f.vaultName} · v{f.currentVersion.versionNo}
                    </span>
                  </span>
                </span>
                <span role="cell" className={styles.mono}>
                  {formatBytes(f.sizeBytes)}
                </span>
                <span role="cell">{f.deletedBy ? shortName(f.deletedBy.displayName) : '—'}</span>
                <span role="cell" className={styles.mono}>
                  {f.deletedAt ? formatWhen(f.deletedAt) : '—'}
                </span>
                <span
                  role="cell"
                  className={cx(
                    styles.left,
                    left <= 1 ? styles.danger : left <= 7 ? styles.warn : styles.ok,
                  )}
                >
                  <span className={styles.dot} aria-hidden />
                  {left} day{left === 1 ? '' : 's'}
                </span>
                <span role="cell" className={styles.actions}>
                  <Button
                    variant="soft"
                    size="sm"
                    icon="restore"
                    disabled={!canRestore(f)}
                    loading={busy === f.id}
                    onClick={() => restore([f.id], name)}
                  >
                    Restore
                  </Button>
                  <Menu
                    label={`More for ${name}`}
                    items={[
                      {
                        label: 'Delete permanently',
                        danger: true,
                        disabled: !canPurge(f),
                        hint: canPurge(f)
                          ? undefined
                          : 'Only owners and managers of the vault can do this',
                        onSelect: () => setPurging({ mode: 'one', file: f, name }),
                      },
                    ]}
                  />
                </span>
              </div>
            )
          })}
        </div>
      )}

      {items.length > 0 && (
        <p className={styles.note}>
          <Icon name="shield" size={12} /> Files are destroyed automatically when the countdown
          reaches zero. Their audit entries stay.
        </p>
      )}

      {purging?.mode === 'one' && (
        <PurgeDialog
          mode="one"
          file={purging.file}
          name={purging.name}
          onClose={() => setPurging(null)}
        />
      )}
      {purging?.mode === 'all' && (
        <PurgeDialog mode="all" files={items.filter(canPurge)} onClose={() => setPurging(null)} />
      )}
    </>
  )
}
