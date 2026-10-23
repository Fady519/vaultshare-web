import { db, type NotificationCategory } from './db'

/*
  What can produce a notification, and whether people may turn it off.
  Security alerts can't be switched off. No notification ever carries key
  material, and file names never appear: the server writes {file} and the
  browser fills in the name it can decrypt.
*/

export type NotificationKind = {
  key: string
  group: 'security' | 'sharing' | 'vault'
  label: string
  channels: string
  category: NotificationCategory
  locked: boolean
  defaultOn: boolean
}

export const NOTIFICATION_KINDS: NotificationKind[] = [
  {
    key: 'security.new_sign_in',
    group: 'security',
    label: 'Sign-in from a new device',
    channels: 'email + in-app',
    category: 'security',
    locked: true,
    defaultOn: true,
  },
  {
    key: 'security.failed_factor',
    group: 'security',
    label: 'Failed second factor',
    channels: 'email + in-app',
    category: 'security',
    locked: true,
    defaultOn: true,
  },
  {
    key: 'security.recovery',
    group: 'security',
    label: 'Password, recovery kit, codes or factors changed',
    channels: 'email + in-app',
    category: 'security',
    locked: true,
    defaultOn: true,
  },
  {
    key: 'security.key_rotated',
    group: 'security',
    label: 'Key rotation completed',
    channels: 'in-app',
    category: 'security',
    locked: false,
    defaultOn: true,
  },
  {
    key: 'share.received',
    group: 'sharing',
    label: 'Someone shares a file with you',
    channels: 'email + in-app',
    category: 'share',
    locked: false,
    defaultOn: true,
  },
  {
    key: 'share.role',
    group: 'sharing',
    label: 'Your role in a vault changes',
    channels: 'email + in-app',
    category: 'share',
    locked: false,
    defaultOn: true,
  },
  {
    key: 'share.revoked',
    group: 'sharing',
    label: 'Access is revoked from you',
    channels: 'in-app',
    category: 'share',
    locked: false,
    defaultOn: false,
  },
  {
    key: 'vault.added',
    group: 'vault',
    label: 'You were added to a vault',
    channels: 'email + in-app',
    category: 'access',
    locked: false,
    defaultOn: true,
  },
  {
    key: 'vault.version',
    group: 'vault',
    label: 'New version committed',
    channels: 'in-app',
    category: 'access',
    locked: false,
    defaultOn: true,
  },
  {
    key: 'vault.trash',
    group: 'vault',
    label: 'File moved to trash',
    channels: 'in-app',
    category: 'access',
    locked: false,
    defaultOn: false,
  },
  {
    key: 'link.opened',
    group: 'vault',
    label: 'Your secure link was opened',
    channels: 'in-app',
    category: 'access',
    locked: false,
    defaultOn: true,
  },
]

export function wants(userId: string, key: string) {
  const kind = NOTIFICATION_KINDS.find((k) => k.key === key)
  if (!kind) return false
  if (kind.locked) return true
  return (
    db.notificationPrefs.find((p) => p.userId === userId && p.key === key)?.enabled ??
    kind.defaultOn
  )
}

export function notify(
  userId: string,
  key: string,
  n: { title: string; body?: string; link?: string | null; fileId?: string | null },
) {
  if (!wants(userId, key)) return
  const kind = NOTIFICATION_KINDS.find((k) => k.key === key)!
  db.notifications.unshift({
    id: crypto.randomUUID(),
    userId,
    key,
    category: kind.category,
    title: n.title,
    body: n.body ?? '',
    link: n.link ?? null,
    fileId: n.fileId ?? null,
    read: false,
    createdAt: new Date().toISOString(),
  })
  // keep the last 100 per person
  const mine = db.notifications.filter((x) => x.userId === userId)
  if (mine.length > 100) {
    const drop = new Set(mine.slice(100).map((x) => x.id))
    db.notifications = db.notifications.filter((x) => !drop.has(x.id))
  }
}
