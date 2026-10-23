import { delay, http, HttpResponse } from 'msw'
import type { MfaFactorDto } from '@/api/types'
import { randomBytes, toBase64Url, utf8 } from '@/crypto/encoding'
import { db, save, type MockFactor } from '../db'
import { appendAudit } from '../audit'
import { hashCode } from '../hash'
import { newTotpSecret, otpauthUri, verifyTotp } from '../totp'
import { API, authenticate, checkStepUp, invalid, newId, now, problem } from './utils'
import { notify } from '../notify'

const CODE_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'

function recoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
  return `${chars.slice(0, 4)}-${chars.slice(4)}`
}

const toDto = (f: MockFactor): MfaFactorDto => ({
  id: f.id,
  type: f.type,
  label: f.label,
  createdAt: f.createdAt,
  lastUsedAt: f.lastUsedAt,
})

const confirmedFactors = (userId: string) =>
  db.factors.filter((f) => f.userId === userId && f.confirmed)

export const mfaHandlers = [
  http.post(`${API}/mfa/totp/setup`, async ({ request }) => {
    await delay()
    const auth = authenticate(request, { onboarding: true })
    if (auth.error) return auth.error

    // throw away any half-finished enrolment, keep confirmed factors
    db.factors = db.factors.filter((f) => !(f.userId === auth.user.id && !f.confirmed))
    const secret = newTotpSecret()
    db.factors.push({
      id: newId(),
      userId: auth.user.id,
      type: 'totp',
      label: 'Authenticator app',
      secret,
      credentialId: null,
      confirmed: false,
      createdAt: now(),
      lastUsedAt: null,
    })
    save()
    return HttpResponse.json({ secret, otpauthUri: otpauthUri(secret, auth.user.email) })
  }),

  http.post(`${API}/mfa/totp/confirm`, async ({ request }) => {
    await delay()
    const auth = authenticate(request, { onboarding: true })
    if (auth.error) return auth.error
    const { code, label } = (await request.json()) as { code: string; label?: string }

    const pending = db.factors.find(
      (f) => f.userId === auth.user.id && f.type === 'totp' && !f.confirmed,
    )
    if (!pending?.secret) return problem(404, 'NOT_FOUND', 'Start the authenticator setup again.')
    if (!(await verifyTotp(pending.secret, code ?? ''))) {
      return invalid(
        'code',
        'That code did not match. Check the time on your phone and try the next one.',
      )
    }

    pending.confirmed = true
    pending.label = label?.trim() || 'Authenticator app'
    await appendAudit(auth.user.id, 'mfa.add', 'user', auth.user.id)
    save()
    return HttpResponse.json({ factorId: pending.id })
  }),

  http.post(`${API}/mfa/webauthn/options`, async ({ request }) => {
    await delay()
    const auth = authenticate(request, { onboarding: true })
    if (auth.error) return auth.error
    const u = auth.user

    const challenge = toBase64Url(randomBytes(32))
    db.challenges.push({ key: `register:${u.id}`, challenge, expiresAt: Date.now() + 5 * 60_000 })
    save()
    return HttpResponse.json({
      options: {
        challenge,
        rp: { name: 'VaultShare', id: location.hostname },
        user: { id: toBase64Url(utf8(u.id)), name: u.email, displayName: u.displayName },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        timeout: 60_000,
        attestation: 'none',
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
        excludeCredentials: confirmedFactors(u.id)
          .filter((f) => f.type === 'webauthn')
          .map((f) => ({ id: f.credentialId, type: 'public-key' })),
      },
    })
  }),

  http.post(`${API}/mfa/webauthn/register`, async ({ request }) => {
    await delay()
    const auth = authenticate(request, { onboarding: true })
    if (auth.error) return auth.error
    const { name, attestation } = (await request.json()) as {
      name: string
      attestation: { id?: string }
    }
    if (!attestation?.id) return invalid('attestation', 'The browser did not return a credential.')

    // real server: Fido2.NET checks the attestation + challenge. the mock just stores the id
    const factor: MockFactor = {
      id: newId(),
      userId: auth.user.id,
      type: 'webauthn',
      label: name?.trim() || 'Security key',
      secret: null,
      credentialId: attestation.id,
      confirmed: true,
      createdAt: now(),
      lastUsedAt: null,
    }
    db.factors.push(factor)
    await appendAudit(auth.user.id, 'mfa.add', 'user', auth.user.id)
    save()
    return HttpResponse.json({ factorId: factor.id })
  }),

  http.post(`${API}/mfa/recovery-codes`, async ({ request }) => {
    await delay()
    const auth = authenticate(request, { onboarding: true })
    if (auth.error) return auth.error
    const u = auth.user

    if (confirmedFactors(u.id).length === 0) {
      return problem(409, 'LAST_FACTOR', 'Add an authenticator app or a security key first.')
    }
    if (u.status === 'active') {
      const stepUp = checkStepUp(request, u.id, 'mfa.regenerate')
      if (stepUp) return stepUp
    }

    const codes = Array.from({ length: 10 }, recoveryCode)
    db.recoveryCodes = db.recoveryCodes.filter((c) => c.userId !== u.id)
    if (u.status === 'active') {
      notify(u.id, 'security.recovery', {
        title: 'New recovery codes were made',
        body: 'The old ten codes no longer work.',
        link: '/settings/security',
      })
    }
    for (const c of codes)
      db.recoveryCodes.push({ userId: u.id, hash: await hashCode(c), usedAt: null })
    save()
    return HttpResponse.json({ codes })
  }),

  http.post(`${API}/mfa/recovery-codes/confirm`, async ({ request }) => {
    await delay()
    const auth = authenticate(request, { onboarding: true })
    if (auth.error) return auth.error
    const { code } = (await request.json()) as { code: string }

    const hash = await hashCode(code ?? '')
    const ok = db.recoveryCodes.some(
      (c) => c.userId === auth.user.id && c.hash === hash && !c.usedAt,
    )
    if (!ok) return invalid('code', 'That is not one of your codes. Type it exactly as shown.')

    if (auth.user.status === 'pendingMfa') auth.user.status = 'active'
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/mfa/factors`, async ({ request }) => {
    await delay()
    const auth = authenticate(request, { onboarding: true })
    if (auth.error) return auth.error
    return HttpResponse.json(confirmedFactors(auth.user.id).map(toDto))
  }),

  http.delete(`${API}/mfa/factors/:id`, async ({ request, params }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const stepUp = checkStepUp(request, auth.user.id, 'mfa.remove')
    if (stepUp) return stepUp

    const mine = confirmedFactors(auth.user.id)
    if (!mine.some((f) => f.id === params.id)) return problem(404, 'NOT_FOUND', 'No such factor.')
    if (mine.length === 1)
      return problem(409, 'LAST_FACTOR', 'You need at least one second factor.')

    db.factors = db.factors.filter((f) => f.id !== params.id)
    await appendAudit(auth.user.id, 'mfa.remove', 'user', auth.user.id)
    notify(auth.user.id, 'security.recovery', {
      title: 'A second factor was removed',
      link: '/settings/security',
    })
    save()
    return new HttpResponse(null, { status: 204 })
  }),
]
