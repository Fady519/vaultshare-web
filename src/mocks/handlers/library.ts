import { delay, http, HttpResponse } from 'msw'
import type { BulkAction, BulkResponse, ErrorCode, RecentEntry } from '@/api/types'
import { db, save } from '../db'
import { roleOf, toFileDto } from '../fileHelpers'
import { purgeExpired, runBulk } from '../fileOps'
import { API, authenticate, invalid } from './utils'

/*
  Lists that cross every vault (favorites, recent, trash, the search index)
  and the bulk endpoint. Registered before the /files/:fileId routes so
  "favorites" isn't read as a file id.
*/

const BULK_ACTIONS: BulkAction[] = ['trash', 'restore', 'purge', 'favorite', 'unfavorite']

const mine = (userId: string, state: 'active' | 'trashed') =>
  db.files.filter((f) => f.state === state && roleOf(f.vaultId, userId))

export const libraryHandlers = [
  http.get(`${API}/files/favorites`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const starred = new Set(
      db.favorites.filter((f) => f.userId === auth.user.id).map((f) => f.fileId),
    )
    const items = mine(auth.user.id, 'active')
      .filter((f) => starred.has(f.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((f) => toFileDto(f, auth.user.id))
      .filter((f) => f !== null)
    return HttpResponse.json(items)
  }),

  // the caller's own uploads and downloads (FileAccess table), newest first, one row per file
  http.get(`${API}/files/recent`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const days = Number(new URL(request.url).searchParams.get('days') ?? 30)
    const since = new Date(Date.now() - days * 86_400_000).toISOString()

    const seen = new Set<string>()
    const items: RecentEntry[] = []
    const rows = db.access
      .filter((a) => a.userId === auth.user.id && a.at >= since)
      .sort((a, b) => b.at.localeCompare(a.at))
    for (const row of rows) {
      if (seen.has(row.fileId)) continue
      const file = db.files.find((f) => f.id === row.fileId && f.state === 'active')
      if (!file || !roleOf(file.vaultId, auth.user.id)) continue
      const dto = toFileDto(file, auth.user.id)
      if (!dto) continue
      seen.add(row.fileId)
      items.push({ file: dto, accessedAt: row.at, action: row.action })
    }
    return HttpResponse.json(items)
  }),

  http.delete(`${API}/files/recent`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    db.access = db.access.filter((a) => a.userId !== auth.user.id)
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/files/trash`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    if (await purgeExpired()) save()
    const items = mine(auth.user.id, 'trashed')
      .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
      .map((f) => toFileDto(f, auth.user.id))
      .filter((f) => f !== null)
    return HttpResponse.json(items)
  }),

  // everything the caller can read, for the search page; the query itself never comes here
  http.get(`${API}/files/index`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const items = mine(auth.user.id, 'active')
      .map((f) => toFileDto(f, auth.user.id))
      .filter((f) => f !== null)
    return HttpResponse.json(items)
  }),

  http.post(`${API}/files/bulk`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const body = (await request.json()) as { action: BulkAction; fileIds: string[] }
    if (!BULK_ACTIONS.includes(body.action)) return invalid('action', 'Unknown bulk action.')
    if (!Array.isArray(body.fileIds) || body.fileIds.length === 0 || body.fileIds.length > 500) {
      return invalid('fileIds', 'Pick between 1 and 500 files.')
    }

    const result: BulkResponse = { done: [], failed: [] }
    for (const id of body.fileIds) {
      const file = db.files.find((f) => f.id === id && f.state !== 'uploading')
      let code: ErrorCode | null = 'NOT_FOUND'
      if (file && roleOf(file.vaultId, auth.user.id))
        code = await runBulk(body.action, file, auth.user.id)
      if (code) result.failed.push({ id, code })
      else result.done.push(id)
    }
    save()
    return HttpResponse.json(result)
  }),
]
