import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Callout,
  EmptyState,
  FileKindBox,
  PageHead,
  SkeletonRows,
  toast,
} from '@/components'
import { filesApi, fileKeys, useRecent } from '@/api/files'
import { queryClient } from '@/api/queryClient'
import { errorMessage } from '@/api/client'
import type { RecentEntry } from '@/api/types'
import { useCrumbs } from '@/hooks/useCrumbs'
import { formatDate, formatTime } from '@/utils/format'
import { useFileNames } from '@/features/files/keys'
import styles from './RecentPage.module.css'

const DAYS = 30

function groupOf(iso: string, now = new Date()) {
  const day = new Date(iso)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diff = Math.floor(
    (today - new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()) / 86_400_000,
  )
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return 'Earlier this week'
  return 'Earlier this month'
}

const ACTION_TEXT: Record<RecentEntry['action'], string> = {
  upload: 'You uploaded and encrypted',
  download: 'You opened and decrypted',
}

// figma 20
export default function RecentPage() {
  useCrumbs('Recent')
  const navigate = useNavigate()
  const recent = useRecent(DAYS)
  const names = useFileNames(recent.data?.map((r) => r.file))
  const [clearing, setClearing] = useState(false)

  const groups = new Map<string, RecentEntry[]>()
  for (const r of recent.data ?? []) {
    const g = groupOf(r.accessedAt)
    groups.set(g, [...(groups.get(g) ?? []), r])
  }

  async function clear() {
    setClearing(true)
    try {
      await filesApi.clearRecent()
      queryClient.invalidateQueries({ queryKey: fileKeys.recent })
      toast('Your history is cleared. The audit log keeps its own record.', 'ok')
    } catch (err) {
      toast(errorMessage(err), 'danger')
    } finally {
      setClearing(false)
    }
  }

  return (
    <>
      <PageHead
        title="Recent"
        meta={`last ${DAYS} days  ·  your own uploads and downloads, recorded by the server when it hands out storage links`}
        actions={
          <Button
            variant="ghost"
            loading={clearing}
            disabled={!recent.data?.length}
            onClick={clear}
          >
            Clear history
          </Button>
        }
      />

      {recent.isPending && <SkeletonRows rows={6} />}
      {recent.isError && (
        <Callout tone="danger" title="Recent files could not be loaded">
          Try again in a moment.
        </Callout>
      )}
      {recent.isSuccess && recent.data.length === 0 && (
        <EmptyState icon="clock" title="Nothing recent">
          Files you upload or open show up here for {DAYS} days.
        </EmptyState>
      )}

      {[...groups].map(([group, rows]) => (
        <section key={group} className={styles.group} aria-label={group}>
          <h2 className={styles.groupTitle}>
            <span>{group}</span>
            <span className={styles.rule} aria-hidden />
          </h2>
          <ul>
            {rows.map((r) => {
              const name = names.data?.[r.file.id] ?? '…'
              const today = group === 'Today' || group === 'Yesterday'
              return (
                <li key={r.file.id} className={styles.row}>
                  <FileKindBox mimeType={r.file.mimeType} name={name} />
                  <div className={styles.text}>
                    <button type="button" onClick={() => navigate(`/files/${r.file.id}`)}>
                      {name}
                    </button>
                    <span>
                      {ACTION_TEXT[r.action]} · v{r.file.currentVersion.versionNo}
                    </span>
                  </div>
                  <span className={styles.vault}>{r.file.vaultName}</span>
                  <time className={styles.when} dateTime={r.accessedAt}>
                    {today ? formatTime(r.accessedAt) : formatDate(r.accessedAt).slice(0, 6)}
                  </time>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </>
  )
}
