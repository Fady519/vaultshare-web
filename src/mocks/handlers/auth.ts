import { delay, http, HttpResponse } from 'msw'
import type {
  LoginMfaRequest,
  LoginRequest,
  RecoveryCompleteRequest,
  RegisterRequest,
  StepUpRequest,
} from '@/api/types'
import { KDF } from '@/crypto/params'
import { fingerprint, importPublicKey, rsaEncrypt } from '@/crypto/rsa'
import { bytesEqual, fromBase64, randomBytes, toBase64 } from '@/crypto/encoding'
import { db, save } from '../db'
import { appendAudit } from '../audit'
import { hashCode, hashVerifier, randomToken, sha256Hex } from '../hash'
import { sendMail, sixDigitCode } from '../mail'
import {
  clearRefreshCookie,
  revokeAllSessions,
  revokeFamilyOf,
  rotateRefresh,
  sessionResponse,
} from '../session'
import { verifyTotp } from '../totp'
import { API, authenticate, findUserByEmail, invalid, isEmail, newId, now, problem } from './utils'

const CODE_TTL = 10 * 60_000
const LINK_TTL = 15 * 60_000

// unknown emails get salts too, derived from the address, so nobody can tell who has an account
async function fakeSalts(email: string) {
  const h = await sha256Hex(`mock-server-secret|${email.toLowerCase()}`)
  const bytes = Uint8Array.from(h.match(/.{2}/g)!.map((x) => parseInt(x, 16)))
  return { saltAuth: toBase64(bytes.slice(0, 16)), saltWrap: toBase64(bytes.slice(16, 32)) }
}

async function sendVerifyCode(email: string) {
  const code = sixDigitCode()
  db.emailCodes = db.emailCodes.filter((c) => c.email !== email)
  db.emailCodes.push({
    email,
    hash: await hashCode(code),
    expiresAt: Date.now() + CODE_TTL,
    sentAt: Date.now(),
  })
  sendMail(
    email,
    'Your VaultShare code',
    `Your verification code is ${code}. It expires in 10 minutes.`,
    { code },
  )
}

function mfaMethods(userId: string) {
  const factors = db.factors.filter((f) => f.userId === userId && f.confirmed)
  const methods: ('totp' | 'webauthn' | 'recovery')[] = []
  if (factors.some((f) => f.type === 'totp')) methods.push('totp')
  if (factors.some((f) => f.type === 'webauthn')) methods.push('webauthn')
  if (db.recoveryCodes.some((c) => c.userId === userId && !c.usedAt)) methods.push('recovery')
  return methods
}

function readMfaToken(token: string) {
  const row = db.mfaTokens.find((t) => t.token === token)
  if (!row || row.expiresAt < Date.now()) return null
  return db.users.find((u) => u.id === row.userId) ?? null
}

async function checkSecondFactor(
  userId: string,
  method: string,
  code?: string,
  assertion?: { id?: string },
) {
  if (method === 'totp' && code) {
    for (const f of db.factors.filter(
      (x) => x.userId === userId && x.type === 'totp' && x.confirmed,
    )) {
      if (f.secret && (await verifyTotp(f.secret, code))) {
        f.lastUsedAt = now()
        return true
      }
    }
  }
  if (method === 'recovery' && code) {
    const hash = await hashCode(code)
    const row = db.recoveryCodes.find((c) => c.userId === userId && c.hash === hash && !c.usedAt)
    if (row) {
      row.usedAt = now()
      return true
    }
  }
  if (method === 'webauthn' && assertion?.id) {
    // a real server verifies the signature with Fido2.NET; the mock only matches the credential
    const f = db.factors.find(
      (x) => x.userId === userId && x.credentialId === assertion.id && x.confirmed,
    )
    if (f) {
      f.lastUsedAt = now()
      return true
    }
  }
  return false
}

function webauthnRequestOptions(userId: string) {
  const challenge = toBase64Url(randomBytes(32))
  db.challenges.push({ key: `login:${userId}`, challenge, expiresAt: Date.now() + 5 * 60_000 })
  return {
    challenge,
    rpId: location.hostname,
    timeout: 60_000,
    userVerification: 'preferred',
    allowCredentials: db.factors
      .filter((f) => f.userId === userId && f.type === 'webauthn' && f.confirmed)
      .map((f) => ({ id: f.credentialId, type: 'public-key' })),
  }
}

function toBase64Url(bytes: Uint8Array) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const authHandlers = [
  http.post(`${API}/auth/prelogin`, async ({ request }) => {
    await delay()
    const { email } = (await request.json()) as { email: string }
    if (!isEmail(email)) return invalid('email', 'Enter a full email address.')
    const user = findUserByEmail(email)
    const salts = user
      ? { saltAuth: user.saltAuth, saltWrap: user.saltWrap }
      : await fakeSalts(email)
    return HttpResponse.json({ ...salts, kdf: KDF })
  }),

  http.post(`${API}/auth/register`, async ({ request }) => {
    await delay()
    const body = (await request.json()) as RegisterRequest
    if (!isEmail(body.email)) return invalid('email', 'Enter a full email address.')
    if (!body.displayName?.trim()) return invalid('displayName', 'Tell us what to call you.')
    if (!body.verifier || !body.saltAuth || !body.saltWrap)
      return invalid('verifier', 'Missing key material.')

    const email = body.email.trim().toLowerCase()
    const existing = findUserByEmail(email)

    if (existing && !existing.emailVerified) {
      // never verified = nothing in it yet: the latest sign-up attempt wins
      existing.displayName = body.displayName.trim()
      existing.saltAuth = body.saltAuth
      existing.saltWrap = body.saltWrap
      existing.verifierHash = await hashVerifier(body.verifier)
      await sendVerifyCode(email)
    } else if (existing) {
      // same answer as a new account. the owner of the address gets told instead
      sendMail(
        email,
        'Someone tried to register with your address',
        'If this was you, sign in instead.',
      )
    } else {
      const id = newId()
      db.users.push({
        id,
        email,
        displayName: body.displayName.trim(),
        avatarUrl: null,
        locale: 'en',
        status: 'pendingKeys',
        emailVerified: false,
        systemRole: 'user',
        createdAt: now(),
        lastActiveAt: null,
        saltAuth: body.saltAuth,
        saltWrap: body.saltWrap,
        verifierHash: await hashVerifier(body.verifier),
        publicKey: '',
        sealedPrivateKey: '',
        sealedRecoveryKey: '',
        keyVersion: 0,
        fingerprint: '',
        keysCreatedAt: null,
        idleLockMinutes: 15,
      })
      await sendVerifyCode(email)
      await appendAudit(id, 'auth.register', 'user', id)
    }
    save()
    return new HttpResponse(null, { status: 202 })
  }),

  http.post(`${API}/auth/resend-verification`, async ({ request }) => {
    await delay()
    const { email } = (await request.json()) as { email: string }
    const user = isEmail(email) ? findUserByEmail(email) : undefined
    if (user && !user.emailVerified) {
      const last = db.emailCodes.find((c) => c.email === user.email)
      if (last && Date.now() - last.sentAt < 30_000) {
        return problem(429, 'RATE_LIMITED', 'Wait a few seconds before asking for another code.')
      }
      await sendVerifyCode(user.email)
      save()
    }
    return new HttpResponse(null, { status: 202 })
  }),

  http.post(`${API}/auth/verify-email`, async ({ request }) => {
    await delay()
    const { email, code } = (await request.json()) as { email: string; code: string }
    const user = isEmail(email) ? findUserByEmail(email) : undefined
    const row = user ? db.emailCodes.find((c) => c.email === user.email) : undefined

    if (!user || !row || row.hash !== (await hashCode(code ?? ''))) {
      return invalid('code', 'That code is not right. Check the latest email.')
    }
    if (row.expiresAt < Date.now()) return invalid('code', 'That code expired. Send a new one.')

    db.emailCodes = db.emailCodes.filter((c) => c !== row)
    user.emailVerified = true
    return sessionResponse(user, request)
  }),

  http.post(`${API}/auth/login`, async ({ request }) => {
    await delay()
    const body = (await request.json()) as LoginRequest
    const user = isEmail(body.email) ? findUserByEmail(body.email) : undefined

    if (!user || user.verifierHash !== (await hashVerifier(body.verifier ?? ''))) {
      if (user) {
        await appendAudit(user.id, 'auth.login_failed', 'user', user.id)
        save()
      }
      return problem(401, 'INVALID_CREDENTIALS', 'That email and password do not match.')
    }
    if (!user.emailVerified) {
      return problem(403, 'EMAIL_NOT_VERIFIED', 'Confirm your email address first.')
    }

    // onboarding not finished: no second factor exists yet, let them continue setup
    if (user.status === 'pendingKeys' || user.status === 'pendingMfa') {
      return sessionResponse(user, request, {
        remember: body.rememberDevice,
        extra: { mfaRequired: false },
      })
    }

    const token = randomToken()
    db.mfaTokens.push({ token, userId: user.id, expiresAt: Date.now() + 5 * 60_000 })
    save()
    return HttpResponse.json({ mfaRequired: true, mfaToken: token, methods: mfaMethods(user.id) })
  }),

  http.post(`${API}/auth/login/mfa`, async ({ request }) => {
    await delay()
    const body = (await request.json()) as LoginMfaRequest & { rememberDevice?: boolean }
    const user = readMfaToken(body.mfaToken)
    if (!user) return problem(401, 'UNAUTHENTICATED', 'That sign-in attempt expired. Start again.')

    if (!(await checkSecondFactor(user.id, body.method, body.code))) {
      await appendAudit(user.id, 'auth.login_failed', 'user', user.id)
      save()
      return problem(401, 'MFA_INVALID', 'That code did not work.')
    }
    db.mfaTokens = db.mfaTokens.filter((t) => t.token !== body.mfaToken)
    await appendAudit(user.id, 'auth.login', 'user', user.id)
    return sessionResponse(user, request, { remember: body.rememberDevice })
  }),

  http.post(`${API}/auth/login/webauthn/options`, async ({ request }) => {
    await delay()
    const { mfaToken } = (await request.json()) as { mfaToken: string }
    const user = readMfaToken(mfaToken)
    if (!user) return problem(401, 'UNAUTHENTICATED', 'That sign-in attempt expired. Start again.')
    const options = webauthnRequestOptions(user.id)
    save()
    return HttpResponse.json({ options })
  }),

  http.post(`${API}/auth/login/webauthn`, async ({ request }) => {
    await delay()
    const body = (await request.json()) as {
      mfaToken: string
      assertion: { id?: string }
      rememberDevice?: boolean
    }
    const user = readMfaToken(body.mfaToken)
    if (!user) return problem(401, 'UNAUTHENTICATED', 'That sign-in attempt expired. Start again.')
    if (!(await checkSecondFactor(user.id, 'webauthn', undefined, body.assertion))) {
      return problem(401, 'MFA_INVALID', 'That security key is not registered on this account.')
    }
    db.mfaTokens = db.mfaTokens.filter((t) => t.token !== body.mfaToken)
    await appendAudit(user.id, 'auth.login', 'user', user.id)
    return sessionResponse(user, request, { remember: body.rememberDevice })
  }),

  http.post(`${API}/auth/refresh`, async ({ request, cookies }) => {
    await delay(80)
    const result = cookies.vs_refresh
      ? rotateRefresh(cookies.vs_refresh, request)
      : { error: 'UNAUTHENTICATED' as const }
    if (result.error) {
      return problem(401, result.error, 'Sign in again.')
    }
    return HttpResponse.json(
      { accessToken: result.accessToken, expiresIn: 600 },
      { headers: { 'Set-Cookie': result.refresh } },
    )
  }),

  http.post(`${API}/auth/logout`, async ({ cookies }) => {
    await delay(80)
    if (cookies.vs_refresh) revokeFamilyOf(cookies.vs_refresh)
    return new HttpResponse(null, { status: 204, headers: { 'Set-Cookie': clearRefreshCookie } })
  }),

  http.post(`${API}/auth/step-up`, async ({ request }) => {
    await delay()
    const auth = authenticate(request)
    if (auth.error) return auth.error
    const body = (await request.json()) as StepUpRequest
    if (
      !(await checkSecondFactor(
        auth.user.id,
        body.method,
        body.code,
        body.assertion as { id?: string },
      ))
    ) {
      await appendAudit(auth.user.id, 'auth.login_failed', 'user', auth.user.id)
      save()
      return problem(401, 'MFA_INVALID', 'That code did not work.')
    }
    const token = randomToken()
    const expiresAt = Date.now() + 5 * 60_000
    db.stepUps.push({ token, userId: auth.user.id, action: body.action, expiresAt })
    await appendAudit(auth.user.id, 'auth.step_up', 'user', auth.user.id)
    save()
    return HttpResponse.json({ stepUpToken: token, expiresAt: new Date(expiresAt).toISOString() })
  }),

  // ---------- forgot password ----------

  http.post(`${API}/auth/recovery/start`, async ({ request }) => {
    await delay()
    const { email, mode } = (await request.json()) as { email: string; mode: 'kit' | 'reset' }
    if (!isEmail(email)) return invalid('email', 'Enter a full email address.')
    const user = findUserByEmail(email)
    if (user && user.status !== 'pendingKeys') {
      const token = randomToken()
      db.recoveryTokens.push({
        token,
        userId: user.id,
        mode,
        expiresAt: Date.now() + LINK_TTL,
        usedAt: null,
        challenge: null,
      })
      const link = `${location.origin}/reset?token=${token}`
      sendMail(
        user.email,
        'Recover your VaultShare account',
        'This link works once, for 15 minutes.',
        { link },
      )
      save()
    }
    return new HttpResponse(null, { status: 202 })
  }),

  http.post(`${API}/auth/recovery/verify`, async ({ request }) => {
    await delay()
    const { token } = (await request.json()) as { token: string }
    const row = db.recoveryTokens.find((t) => t.token === token)
    if (!row || row.usedAt || row.expiresAt < Date.now()) {
      return problem(410, 'LINK_GONE', 'This recovery link is no longer valid.')
    }
    const user = db.users.find((u) => u.id === row.userId)!

    if (row.mode === 'reset') {
      return HttpResponse.json({ mode: 'reset', email: user.email, kdf: KDF })
    }

    // proof of the private key: only its owner can open this
    const secret = randomBytes(32)
    row.challenge = toBase64(secret)
    const sealed = await rsaEncrypt(await importPublicKey(fromBase64(user.publicKey)), secret)
    save()
    return HttpResponse.json({
      mode: 'kit',
      email: user.email,
      kdf: KDF,
      sealedRecoveryKey: user.sealedRecoveryKey,
      challenge: toBase64(sealed),
    })
  }),

  http.post(`${API}/auth/recovery/complete`, async ({ request }) => {
    await delay()
    const body = (await request.json()) as RecoveryCompleteRequest
    const row = db.recoveryTokens.find((t) => t.token === body.token)
    if (!row || row.usedAt || row.expiresAt < Date.now()) {
      return problem(410, 'LINK_GONE', 'This recovery link is no longer valid.')
    }
    const user = db.users.find((u) => u.id === row.userId)!

    if (row.mode === 'kit') {
      const ok =
        row.challenge &&
        body.challengeAnswer &&
        bytesEqual(fromBase64(row.challenge), fromBase64(body.challengeAnswer))
      if (!ok) return problem(403, 'FORBIDDEN_ROLE', 'The recovery kit did not prove the key.')
    } else {
      if (!body.publicKey || !body.sealedRecoveryKey)
        return invalid('publicKey', 'New keys are required.')
      // new key pair: everything wrapped for the old one is gone for good
      user.publicKey = body.publicKey
      user.sealedRecoveryKey = body.sealedRecoveryKey
      user.keyVersion += 1
      user.fingerprint = await fingerprint(fromBase64(body.publicKey))
      user.keysCreatedAt = now()
      await appendAudit(user.id, 'keys.rotate', 'user', user.id)
    }

    user.saltAuth = body.saltAuth
    user.saltWrap = body.saltWrap
    user.verifierHash = await hashVerifier(body.verifier)
    user.sealedPrivateKey = body.sealedPrivateKey
    row.usedAt = now()
    revokeAllSessions(user.id)
    sendMail(
      user.email,
      'Your VaultShare password was changed',
      'All other sessions were signed out.',
    )
    save()
    return new HttpResponse(null, { status: 204 })
  }),
]
