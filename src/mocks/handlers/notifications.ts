import { delay, http, HttpResponse } from 'msw'
import type { NotificationDto, NotificationSettingDto } from '@/api/types'
import { db, save } from '../db'
import { NOTIFICATION_KINDS, wants } from '../notify'
import { API, authenticate, invalid } from './utils'

export const notificationHandlers = [
  http.get(`${API}/notifications`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const list: NotificationDto[] = db.notifications
      .filter((n) => n.userId === auth.user.id)
      .slice(0, 100)
      .map((n) => ({
        id: n.id,
        key: n.key,
        category: n.category,
        title: n.title,
        body: n.body,
        link: n.link,
        fileId: n.fileId,
        read: n.read,
        createdAt: n.createdAt,
      }))
    return HttpResponse.json(list)
  }),

  http.post(`${API}/notifications/read-all`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    for (const n of db.notifications) if (n.userId === auth.user.id) n.read = true
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${API}/notifications/:id/read`, async ({ request, params }) => {
    await delay(60)
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const n = db.notifications.find((x) => x.id === params.id && x.userId === auth.user.id)
    if (n) n.read = true
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/notification-settings`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const list: NotificationSettingDto[] = NOTIFICATION_KINDS.map((k) => ({
      key: k.key,
      group: k.group,
      label: k.label,
      channels: k.channels,
      enabled: wants(auth.user.id, k.key),
      locked: k.locked,
    }))
    return HttpResponse.json(list)
  }),

  http.put(`${API}/notification-settings`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const { key, enabled } = (await request.json()) as { key: string; enabled: boolean }
    const kind = NOTIFICATION_KINDS.find((k) => k.key === key)
    if (!kind) return invalid('key', 'Unknown notification.')
    if (kind.locked) return invalid('key', 'Security alerts cannot be switched off.')
    db.notificationPrefs = db.notificationPrefs.filter(
      (p) => !(p.userId === auth.user.id && p.key === key),
    )
    db.notificationPrefs.push({ userId: auth.user.id, key, enabled: Boolean(enabled) })
    save()
    return new HttpResponse(null, { status: 204 })
  }),
]
