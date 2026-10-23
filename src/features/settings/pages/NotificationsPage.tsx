import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Chip,
  EmptyState,
  Icon,
  PageHead,
  SkeletonRows,
  toast,
  type IconName,
} from '@/components'
import { errorMessage } from '@/api/client'
import { useFileIndex } from '@/api/files'
import { settingsApi, settingsKeys, useNotifications } from '@/api/settings'
import type { NotificationDto } from '@/api/types'
import { useCrumbs } from '@/hooks/useCrumbs'
import { cx } from '@/utils/cx'
import { timeAgo } from '@/utils/format'
import { useFileNames } from '@/features/files/keys'
import styles from './NotificationsPage.module.css'

type Filter = 'all' | NotificationDto['category']

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'security', label: 'Security' },
  { key: 'share', label: 'Shares' },
  { key: 'access', label: 'Vault activity' },
]

const ICON: Record<NotificationDto['category'], IconName> = {
  security: 'shield',
  share: 'share',
  access: 'folder',
  quota: 'list',
}

// figma 43
export default function NotificationsPage() {
  useCrumbs('Notifications')
  const qc = useQueryClient()
  const navigate = useNavigate()
  const list = useNotifications()
  const index = useFileIndex()
  const names = useFileNames(index.data)
  const [filter, setFilter] = useState<Filter>('all')

  const items = useMemo(() => list.data ?? [], [list.data])
  const shown = items.filter((n) => filter === 'all' || n.category === filter)
  const unread = items.filter((n) => !n.read).length
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length }
    for (const n of items) c[n.category] = (c[n.category] ?? 0) + 1
    return c
  }, [items])

  // the server writes {file}; only this tab knows the name
  const title = (n: NotificationDto) => {
    const name = n.fileId ? names.data?.[n.fileId] : undefined
    return n.title.replace('{file}', name ?? 'a file')
  }

  async function open(n: NotificationDto) {
    if (!n.read) {
      qc.setQueryData<NotificationDto[]>(settingsKeys.notifications, (l) =>
        l?.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      )
      settingsApi.markRead(n.id).catch(() => {})
    }
    if (n.link) navigate(n.link)
  }

  async function readAll() {
    try {
      await settingsApi.markAllRead()
    } catch (err) {
      toast(errorMessage(err), 'danger')
    } finally {
      qc.invalidateQueries({ queryKey: settingsKeys.notifications })
    }
  }

  return (
    <>
      <PageHead
        title="Notifications"
        meta={`${unread} unread  ·  security events are never batched  ·  file names are filled in by this tab`}
        actions={
          <>
            <Button variant="ghost" disabled={!unread} onClick={readAll}>
              Mark all read
            </Button>
            <Button variant="ghost" icon="cog" to="/settings/notifications">
              Settings
            </Button>
          </>
        }
      />

      <div className={styles.filters}>
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            on={filter === f.key}
            count={counts[f.key] ?? 0}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Chip>
        ))}
      </div>

      {list.isPending && <SkeletonRows rows={6} />}
      {list.isSuccess && shown.length === 0 && (
        <EmptyState icon="bell" title="Nothing here">
          Shares, sign-ins from new devices and changes in your vaults show up here.
        </EmptyState>
      )}

      <ul className={styles.list}>
        {shown.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className={cx(styles.item, !n.read && styles.unread)}
              onClick={() => open(n)}
            >
              <span className={cx(styles.icon, styles[n.category])}>
                <Icon name={ICON[n.category]} />
              </span>
              <span className={styles.text}>
                <span className={styles.title}>{title(n)}</span>
                {n.body && <span className={styles.body}>{n.body}</span>}
              </span>
              <time className={styles.when} dateTime={n.createdAt}>
                {timeAgo(n.createdAt)}
              </time>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
