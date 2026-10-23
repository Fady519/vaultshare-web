import { http, HttpResponse } from 'msw'
import { fromBase64, toHex } from '@/crypto/encoding'
import { getBlob, putBlob } from '../blobStore'
import { db, save } from '../db'
import { currentTotp, secondsLeft } from '../totp'

/*
  Not part of the API contract. These exist only in the mock so the flows can be
  clicked through without a mail server or a phone:
  - /__dev/outbox  the emails the "server" sent (verify codes, recovery links)
  - /__dev/totp    the current authenticator code for an account
  - /__dev/ping    lets the app check the mock is really the one answering
  - /__dev/tamper  flips one byte of a stored chunk, to show the integrity check failing
  - /__dev/audit-tamper  edits one audit entry in place, to show the chain check failing
*/

async function chunkState(versionId: string) {
  const version = db.versions.find((v) => v.id === versionId)
  const meta = db.chunks.find((c) => c.versionId === versionId && c.index === 0)
  if (!version || !meta) return null
  const key = `${version.storagePfx}/0`
  const bytes = await getBlob(key)
  if (!bytes) return null
  const hash = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
  return { key, bytes, tampered: hash !== toHex(fromBase64(meta.digest)) }
}

export const devHandlers = [
  http.get('/__dev/audit-tamper', () =>
    HttpResponse.json({ seq: db.audit.find((e) => e.tamperedFrom)?.seq ?? null }),
  ),

  // what a malicious database admin would do: change history without fixing the hashes
  http.post('/__dev/audit-tamper', () => {
    const done = db.audit.find((e) => e.tamperedFrom)
    if (done) {
      done.action = done.tamperedFrom!
      delete done.tamperedFrom
      save()
      return HttpResponse.json({ seq: null })
    }
    const target = db.audit[Math.floor(db.audit.length / 2)]
    if (!target) return HttpResponse.json({ seq: null })
    target.tamperedFrom = target.action
    target.action = target.action === 'file.download' ? 'file.upload' : 'file.download'
    save()
    return HttpResponse.json({ seq: target.seq })
  }),

  http.get('/__dev/ping', () => HttpResponse.json({ mock: true })),

  http.get('/__dev/tamper', async ({ request }) => {
    const state = await chunkState(new URL(request.url).searchParams.get('versionId') ?? '')
    return HttpResponse.json({ tampered: state?.tampered ?? false })
  }),

  // flipping the same bit again puts the original bytes back
  http.post('/__dev/tamper', async ({ request }) => {
    const state = await chunkState(new URL(request.url).searchParams.get('versionId') ?? '')
    if (!state) return HttpResponse.json({ tampered: false }, { status: 404 })
    const bytes = new Uint8Array(state.bytes)
    bytes[Math.min(20, bytes.length - 1)] ^= 0x01
    await putBlob(state.key, bytes)
    return HttpResponse.json({ tampered: !state.tampered })
  }),

  http.get('/__dev/outbox', ({ request }) => {
    const to = new URL(request.url).searchParams.get('to')?.toLowerCase()
    return HttpResponse.json(db.outbox.filter((m) => !to || m.to === to).slice(0, 5))
  }),

  http.get('/__dev/totp', async ({ request }) => {
    const email = new URL(request.url).searchParams.get('email')?.toLowerCase()
    const user = db.users.find((u) => u.email === email)
    // newest totp factor, confirmed or still being set up
    const factor = user
      ? db.factors.filter((f) => f.userId === user.id && f.type === 'totp' && f.secret).pop()
      : undefined
    if (!factor?.secret) return HttpResponse.json({ code: null, secondsLeft: 0 })
    return HttpResponse.json({ code: await currentTotp(factor.secret), secondsLeft: secondsLeft() })
  }),
]
