import type { MockDb, MockFactor, MockMember, MockUser, MockVault } from './db'
import { hashCode } from './hash'
import { seedFiles } from './seedFiles'
import keys from './seed-keys.json'

/*
  Demo data. The keys in seed-keys.json are real (made by scripts/make-mock-seed.ts),
  so the demo users can sign in and their private keys actually open.

  every demo user:  password  northgate-vault-2026
*/

// fixed ids so links like /vaults/<id> survive a reseed
const ID = {
  jack: '6f1d2c34-6c1a-4f0e-9a51-0c0f5b1e7a01',
  maya: '6f1d2c34-6c1a-4f0e-9a51-0c0f5b1e7a02',
  ilan: '6f1d2c34-6c1a-4f0e-9a51-0c0f5b1e7a03',
  sam: '6f1d2c34-6c1a-4f0e-9a51-0c0f5b1e7a04',
  legal: '0b9e7d55-2f3a-4c1b-8e6d-1a2b3c4d5e01',
  eng: '0b9e7d55-2f3a-4c1b-8e6d-1a2b3c4d5e02',
  board: '0b9e7d55-2f3a-4c1b-8e6d-1a2b3c4d5e03',
  personal: '0b9e7d55-2f3a-4c1b-8e6d-1a2b3c4d5e04',
  // Maya's, so Jack has files that were shared with him rather than vault access
  deals: '0b9e7d55-2f3a-4c1b-8e6d-1a2b3c4d5e05',
}

// the codes from figma screen 07, so the "use a recovery code" path can be demoed
export const DEMO_RECOVERY_CODES = [
  '4KQ2-9WFH',
  '8ZJ5-3MTA',
  '1XR7-6BNC',
  'QP04-2LDS',
  '7HVE-5KYG',
  '0TMB-8CJR',
  '3NWD-1FQX',
  '9SLA-4GHP',
  '6RUK-7VZE',
  '2EYC-0DTM',
]

export const DEMO_INVITE_TOKEN = 'demo-invite-2026'

type SeedName = keyof typeof keys

function user(
  name: SeedName,
  id: string,
  email: string,
  displayName: string,
  extra: Partial<MockUser> = {},
): MockUser {
  const k = keys[name]
  return {
    id,
    email,
    displayName,
    avatarUrl: null,
    locale: 'en',
    status: 'active',
    emailVerified: true,
    systemRole: 'user',
    createdAt: '2026-01-10T09:00:00.000Z',
    lastActiveAt: null,
    saltAuth: k.saltAuth,
    saltWrap: k.saltWrap,
    verifierHash: k.verifierHash,
    publicKey: k.publicKey,
    sealedPrivateKey: k.sealedPrivateKey,
    sealedRecoveryKey: k.sealedRecoveryKey,
    keyVersion: 1,
    fingerprint: k.fingerprint,
    keysCreatedAt: '2026-01-10T09:02:00.000Z',
    idleLockMinutes: 15,
    ...extra,
  }
}

function totp(name: SeedName, userId: string): MockFactor {
  return {
    id: crypto.randomUUID(),
    userId,
    type: 'totp',
    label: 'Authenticator app',
    secret: keys[name].totpSecret,
    credentialId: null,
    confirmed: true,
    createdAt: '2026-01-10T09:03:00.000Z',
    lastUsedAt: null,
  }
}

function vault(
  id: string,
  name: string,
  description: string,
  createdAt: string,
  ownerId = ID.jack,
): MockVault {
  return { id, name, description, ownerId, createdAt }
}

function member(vaultId: string, userId: string, role: MockMember['role']): MockMember {
  return { vaultId, userId, role, status: 'active', joinedAt: '2026-01-14T10:00:00.000Z' }
}

export async function seed(): Promise<Omit<MockDb, 'version'>> {
  const recoveryCodes = await Promise.all(
    DEMO_RECOVERY_CODES.map(async (c) => ({
      userId: ID.jack,
      hash: await hashCode(c),
      usedAt: null,
    })),
  )

  const base = {
    users: [
      user('jack', ID.jack, 'jack@northgate.io', 'Jack Bermingham', { systemRole: 'admin' }),
      user('maya', ID.maya, 'maya@northgate.io', 'Maya Okafor'),
      user('ilan', ID.ilan, 'ilan@northgate.io', 'Ilan Rosen'),
      user('sam', ID.sam, 'sam@northgate.io', 'Sam Kader'),
    ],
    vaults: [
      vault(
        ID.legal,
        'Product Legal',
        'Contracts, DPAs and NDAs for Northgate.',
        '2026-01-14T10:00:00.000Z',
      ),
      vault(
        ID.eng,
        'Engineering',
        'Architecture notes and pentest reports.',
        '2026-01-16T08:30:00.000Z',
      ),
      vault(ID.board, 'Board 2026', 'Board packs and minutes.', '2026-01-20T12:00:00.000Z'),
      vault(ID.personal, 'Personal', 'Only me.', '2026-01-10T09:05:00.000Z'),
      vault(
        ID.deals,
        'Partner deals',
        'Maya and Ilan. Single files get shared out.',
        '2026-02-02T09:00:00.000Z',
        ID.maya,
      ),
    ],
    members: [
      member(ID.legal, ID.jack, 'owner'),
      member(ID.legal, ID.maya, 'manager'),
      member(ID.legal, ID.ilan, 'editor'),
      member(ID.legal, ID.sam, 'viewer'),
      member(ID.eng, ID.jack, 'owner'),
      member(ID.eng, ID.ilan, 'editor'),
      member(ID.board, ID.jack, 'owner'),
      member(ID.board, ID.maya, 'viewer'),
      member(ID.personal, ID.jack, 'owner'),
      member(ID.deals, ID.maya, 'owner'),
      member(ID.deals, ID.ilan, 'editor'),
    ],
  }

  const fileTables = await seedFiles(
    base,
    { legal: ID.legal, eng: ID.eng, board: ID.board, personal: ID.personal, deals: ID.deals },
    { jack: ID.jack, maya: ID.maya, ilan: ID.ilan, sam: ID.sam },
  )

  return {
    ...base,
    ...fileTables,
    factors: [
      totp('jack', ID.jack),
      totp('maya', ID.maya),
      totp('ilan', ID.ilan),
      totp('sam', ID.sam),
    ],
    recoveryCodes,
    invitations: [
      {
        id: crypto.randomUUID(),
        token: DEMO_INVITE_TOKEN,
        email: 'nora@northgate.io',
        vaultId: ID.legal,
        role: 'editor',
        invitedBy: ID.maya,
        status: 'pending',
        createdAt: '2026-10-20T09:00:00.000Z',
        expiresAt: '2027-01-01T00:00:00.000Z',
      },
    ],
    accessTokens: [],
    // Jack is also signed in on a phone, a tablet and an unknown Windows box (figma 44)
    refreshTokens: [
      otherSession(ID.jack, IPHONE, 2, true),
      otherSession(ID.jack, WINDOWS, 0.07, false),
      otherSession(ID.jack, IPAD, 6 * 24, true),
    ],
    mfaTokens: [],
    emailCodes: [],
    recoveryTokens: [],
    challenges: [],
    stepUps: [],
    outbox: [],
    notifications: [
      ...fileTables.notifications,
      {
        id: crypto.randomUUID(),
        userId: ID.jack,
        key: 'security.new_sign_in',
        category: 'security',
        title: 'New sign-in: Chrome 128 on Windows',
        body: 'If this was not you, revoke the session and change your password.',
        link: '/settings/sessions',
        fileId: null,
        read: false,
        createdAt: hoursAgo(0.07),
      },
    ],
    notificationPrefs: [],
    keyHistory: base.users.map((u) => ({
      userId: u.id,
      keyVersion: u.keyVersion,
      fingerprint: u.fingerprint,
      algorithm: 'RSA-4096-OAEP',
      createdAt: u.keysCreatedAt ?? u.createdAt,
      retiredAt: null,
      state: 'active' as const,
    })),
    settings: {
      retentionDays: 30,
      quotaBytes: 10 * 1024 ** 3,
      linkMaxDays: 90,
      mfaRequired: true,
    },
  }
}

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

// a refresh family nobody can use (the token is random), only there to be listed and revoked
function otherSession(
  userId: string,
  userAgent: string,
  lastUsedHoursAgo: number,
  remember: boolean,
) {
  return {
    token: crypto.randomUUID(),
    userId,
    familyId: crypto.randomUUID(),
    usedAt: null,
    createdAt: hoursAgo(lastUsedHoursAgo),
    expiresAt: Date.now() + 14 * 86_400_000 - lastUsedHoursAgo * 3_600_000,
    userAgent,
    remember,
  }
}
