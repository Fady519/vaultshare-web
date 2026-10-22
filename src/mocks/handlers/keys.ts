import { delay, http, HttpResponse } from 'msw'
import type { KeySetupRequest } from '@/api/types'
import { fingerprint } from '@/crypto/rsa'
import { fromBase64 } from '@/crypto/encoding'
import { save } from '../db'
import { appendAudit } from '../audit'
import { API, authenticate, invalid, now, problem } from './utils'

export const keyHandlers = [
  // end of the key ceremony: the server only ever gets the public key and two sealed blobs
  http.post(`${API}/keys/setup`, async ({ request }) => {
    await delay()
    const auth = authenticate(request, { onboarding: true })
    if (auth.error) return auth.error
    const user = auth.user
    if (user.status !== 'pendingKeys') {
      return problem(409, 'ALREADY_MEMBER', 'This account already has keys.')
    }

    const body = (await request.json()) as KeySetupRequest
    if (!body.publicKey || !body.sealedPrivateKey || !body.sealedRecoveryKey) {
      return invalid('publicKey', 'Missing key material.')
    }

    user.publicKey = body.publicKey
    user.sealedPrivateKey = body.sealedPrivateKey
    user.sealedRecoveryKey = body.sealedRecoveryKey
    user.keyVersion = body.keyVersion || 1
    user.fingerprint = await fingerprint(fromBase64(body.publicKey))
    user.keysCreatedAt = now()
    user.status = 'pendingMfa'
    await appendAudit(user.id, 'keys.setup', 'user', user.id)
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/keys/me`, async ({ request }) => {
    await delay()
    const auth = authenticate(request, { onboarding: true })
    if (auth.error) return auth.error
    const u = auth.user
    if (!u.publicKey) return problem(404, 'NOT_FOUND', 'No keys yet. Finish the key ceremony.')
    return HttpResponse.json({
      publicKey: u.publicKey,
      sealedPrivateKey: u.sealedPrivateKey,
      keyVersion: u.keyVersion,
      fingerprint: u.fingerprint,
      createdAt: u.keysCreatedAt,
    })
  }),
]
