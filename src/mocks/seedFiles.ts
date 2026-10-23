import { concatBytes, fromHex, toBase64, toBase64Url, toHex, utf8 } from '@/crypto/encoding'
import { sealForLink } from '@/crypto/links'
import {
  chunkAad,
  encryptChunk,
  encryptText,
  nameAad,
  newDataKey,
  noteAad,
  versionDigest,
  wrapDataKey,
} from '@/crypto/files'
import type {
  MockAudit,
  MockChunk,
  MockDb,
  MockFile,
  MockAccess,
  MockFavorite,
  MockLink,
  MockNotification,
  MockShare,
  MockVersion,
  MockWrappedKey,
} from './db'
import { putBlob } from './blobStore'
import { canonical } from './audit'
import { makeCsv, makeLogoSvg, makeMarkdown, makePdf, makeText } from './sampleContent'

/*
  Demo files, encrypted for real when the mock database is first created —
  the same thing the members' browsers would have done when they uploaded.
*/

type Who = 'jack' | 'maya' | 'ilan' | 'sam'

/*
  One working secure link in the demo data, on contract-northgate-2026.pdf.
  The key below is what would normally only ever exist in the link itself;
  it's fixed here so the README can print a link that opens.
*/
export const DEMO_LINK_TOKEN = 'demoLink2026Nq4vXr8TkP2mW7sYb3Hd'
const DEMO_LINK_KEY = fromHex('9f3c1a77e0b45d2288ac31f05d41402abc4b2a76b9719d91c48a2cc98436a10b')
export const DEMO_LINK_FRAGMENT = toBase64Url(DEMO_LINK_KEY)
type SeedVersion = { by: Who; hoursAgo: number; note?: string; content: Uint8Array }
type SeedFile = {
  name: string
  mime: string
  versions: SeedVersion[]
  favorite?: boolean
  // opened (downloaded and decrypted) by someone, for the Recent page
  opened?: { by: Who; hoursAgo: number }[]
  // in the trash since then; purged RETENTION_DAYS later
  trashed?: { by: Who; hoursAgo: number }
  // shared straight with someone outside the vault
  shares?: {
    to: Who
    by: Who
    role: 'viewer' | 'editor'
    hoursAgo: number
    expiresInDays?: number
  }[]
  // the demo secure link
  link?: boolean
}

const PDF = 'application/pdf'
const MD = 'text/markdown'
const CSV = 'text/csv'
const TXT = 'text/plain'

const contract = (rev: number, clause: string) =>
  makePdf('Master services agreement', 'Northgate Industrial Ltd.', [
    {
      heading: '7. Confidentiality and data handling',
      body: '7.1 Each party shall treat all Confidential Information disclosed by the other party as strictly confidential and shall not disclose it to any third party without prior written consent.',
    },
    { heading: `7.2 (revision ${rev})`, body: clause },
    {
      heading: '8. Audit and inspection',
      body: 'The Customer may audit the Supplier once per year with thirty days notice. Audit evidence is limited to metadata and access logs; no auditor is given plaintext access to Customer Data.',
    },
  ])

function plan(): Record<string, SeedFile[]> {
  return {
    legal: [
      {
        name: 'contract-northgate-2026.pdf',
        mime: PDF,
        favorite: true,
        link: true,
        opened: [{ by: 'jack', hoursAgo: 3 }],
        versions: [
          {
            by: 'jack',
            hoursAgo: 410,
            note: 'Initial upload',
            content: contract(1, 'The Supplier shall use reasonable security measures.'),
          },
          {
            by: 'ilan',
            hoursAgo: 300,
            note: 'Counterparty edits',
            content: contract(2, 'The Supplier shall encrypt Customer Data at rest.'),
          },
          {
            by: 'jack',
            hoursAgo: 120,
            note: 'Added appendix B',
            content: contract(
              3,
              'The Supplier shall encrypt Customer Data in transit and at rest.',
            ),
          },
          {
            by: 'maya',
            hoursAgo: 2,
            note: 'Redlined clause 7.2',
            content: contract(
              4,
              'The Supplier shall ensure that all Customer Data is encrypted in transit and at rest using industry standard algorithms, and that no member of Supplier personnel is technically capable of reading Customer Data in plaintext.',
            ),
          },
        ],
      },
      {
        name: 'dpa-appendix-signed.pdf',
        mime: PDF,
        favorite: true,
        versions: [
          {
            by: 'jack',
            hoursAgo: 60,
            note: 'Unsigned draft',
            content: makePdf('Data processing agreement', 'Appendix 2 - Technical measures', [
              {
                heading: 'Encryption',
                body: 'AES-256-GCM for content, RSA-4096-OAEP for key wrapping. Keys never leave the client.',
              },
            ]),
          },
          {
            by: 'jack',
            hoursAgo: 26,
            note: 'Signed by both parties',
            content: makePdf(
              'Data processing agreement',
              'Appendix 2 - Technical measures (signed)',
              [
                {
                  heading: 'Encryption',
                  body: 'AES-256-GCM for content, RSA-4096-OAEP for key wrapping. Keys never leave the client.',
                },
                {
                  heading: 'Signatures',
                  body: 'Signed for Northgate by M. Okafor and for the Supplier by J. Bermingham.',
                },
              ],
            ),
          },
        ],
      },
      {
        name: 'security-review-q1.md',
        mime: MD,
        favorite: true,
        opened: [{ by: 'jack', hoursAgo: 26 }],
        versions: [1, 2, 3].map((rev, i) => ({
          by: 'ilan' as Who,
          hoursAgo: 200 - i * 80 + (i === 2 ? 15 : 0),
          note: ['First pass', 'Findings from pentest', 'Ready for review'][i],
          content: makeMarkdown('Security review Q1', rev, [
            'Argon2id parameters verified: m=64 MiB, t=3, p=4',
            'Refresh token rotation detects reuse',
            ...(rev > 1 ? ['CSP blocks inline scripts on every page'] : []),
            ...(rev > 2 ? ['Audit chain verified end to end in the browser'] : []),
          ]),
        })),
      },
      {
        name: 'pentest-findings.csv',
        mime: CSV,
        favorite: true,
        versions: [
          {
            by: 'jack',
            hoursAgo: 72,
            note: 'From the April test',
            content: makeCsv(
              ['id', 'severity', 'finding', 'status'],
              [
                ['VS-01', 'low', 'Verbose error on 404', 'fixed'],
                ['VS-02', 'medium', 'Missing rate limit on resend', 'fixed'],
                ['VS-03', 'info', 'Server banner exposes version', 'open'],
              ],
            ),
          },
        ],
      },
      {
        name: 'vendor-msa-draft.pdf',
        mime: PDF,
        versions: [1, 2, 3].map((rev, i) => ({
          by: 'maya' as Who,
          hoursAgo: 330 - i * 100,
          note: ['Template', 'Pricing schedule', 'Legal comments'][i],
          content: makePdf('Vendor agreement', `Master services agreement - draft ${rev}`, [
            {
              heading: 'Scope',
              body: 'Provision of secure document exchange services for the Customer and its subsidiaries.',
            },
          ]),
        })),
      },
      {
        name: 'board-minutes-jan.pdf',
        mime: PDF,
        versions: [
          {
            by: 'jack',
            hoursAgo: 260,
            content: makePdf('Board of directors', 'Minutes - January 2026', [
              {
                heading: 'Resolutions',
                body: 'The board approved the adoption of end-to-end encrypted storage for all legal records.',
              },
            ]),
          },
        ],
      },
      {
        name: 'logo-mark.svg',
        mime: 'image/svg+xml',
        versions: [
          { by: 'maya', hoursAgo: 290, note: 'First draft', content: makeLogoSvg('#1F6B54') },
          { by: 'maya', hoursAgo: 280, note: 'Brighter accent', content: makeLogoSvg('#57C79E') },
        ],
      },
      {
        name: 'q3-forecast-northgate.csv',
        mime: CSV,
        versions: [1, 2].map((rev, i) => ({
          by: 'ilan' as Who,
          hoursAgo: 340 - i * 20,
          content: makeCsv(
            ['month', 'licences', 'revenue_eur'],
            [
              ['Jul', 120 + rev * 4, 18000 + rev * 600],
              ['Aug', 128 + rev * 4, 19200 + rev * 600],
              ['Sep', 140 + rev * 4, 21000 + rev * 600],
            ],
          ),
        })),
      },
      {
        name: 'nda-acme-signed.pdf',
        mime: PDF,
        versions: [
          {
            by: 'jack',
            hoursAgo: 360,
            content: makePdf('Non-disclosure agreement', 'Northgate / Acme Corp.', [
              { heading: 'Term', body: 'Three years from the effective date.' },
            ]),
          },
        ],
      },
      {
        name: 'architecture-notes.md',
        mime: MD,
        opened: [{ by: 'jack', hoursAgo: 52 }],
        versions: [1, 2].map((rev, i) => ({
          by: 'maya' as Who,
          hoursAgo: 390 - i * 10,
          content: makeMarkdown('Architecture notes', rev, [
            'Clean Architecture, dependencies point inward',
            'Ciphertext goes browser -> object storage directly',
            ...(rev > 1 ? ['The API never proxies file bytes'] : []),
          ]),
        })),
      },
      {
        name: 'insurance-cert-2026.pdf',
        mime: PDF,
        versions: [
          {
            by: 'jack',
            hoursAgo: 420,
            content: makePdf('Certificate of insurance', 'Cyber liability 2026', [
              { heading: 'Cover', body: 'EUR 5,000,000 aggregate.' },
            ]),
          },
        ],
      },
      {
        name: 'supplier-audit-2025.txt',
        mime: TXT,
        versions: [1, 2, 3].map((rev, i) => ({
          by: 'ilan' as Who,
          hoursAgo: 460 - i * 12,
          content: makeText('Supplier audit 2025', rev, [
            'All suppliers reviewed',
            `Open items: ${4 - rev}`,
          ]),
        })),
      },
      {
        name: 'old-msa-2024.pdf',
        mime: PDF,
        trashed: { by: 'jack', hoursAgo: 2 },
        versions: [
          {
            by: 'jack',
            hoursAgo: 2900,
            content: makePdf('Master services agreement', '2024 edition (superseded)', [
              { heading: 'Status', body: 'Replaced by the 2026 agreement.' },
            ]),
          },
        ],
      },
      {
        name: 'draft-notes-v1.md',
        mime: MD,
        trashed: { by: 'maya', hoursAgo: 26 },
        versions: [
          {
            by: 'maya',
            hoursAgo: 400,
            content: makeMarkdown('Draft notes', 1, ['Old structure, see contract v4']),
          },
        ],
      },
      {
        name: 'nda-template-2024.txt',
        mime: TXT,
        trashed: { by: 'jack', hoursAgo: 27 * 24 },
        versions: [
          {
            by: 'jack',
            hoursAgo: 3000,
            content: makeText('NDA template 2024', 1, ['Mutual NDA, two years']),
          },
        ],
      },
      {
        name: 'invoice-scan-april.pdf',
        mime: PDF,
        trashed: { by: 'jack', hoursAgo: 29 * 24 + 2 },
        versions: [
          {
            by: 'jack',
            hoursAgo: 3100,
            content: makePdf('Invoice', 'April 2026', [{ heading: 'Total', body: 'EUR 12,400' }]),
          },
        ],
      },
    ],
    eng: [
      {
        name: 'api-threat-model.md',
        mime: MD,
        shares: [{ to: 'maya', by: 'jack', role: 'viewer', hoursAgo: 70, expiresInDays: 25 }],
        favorite: true,
        versions: [1, 2].map((rev, i) => ({
          by: (i ? 'ilan' : 'jack') as Who,
          hoursAgo: 150 - i * 100,
          content: makeMarkdown('API threat model', rev, [
            'Compromised server sees ciphertext and metadata only',
            'Stolen refresh token: family revoked on reuse',
          ]),
        })),
      },
      {
        name: 'pentest-scope.pdf',
        mime: PDF,
        versions: [
          {
            by: 'ilan',
            hoursAgo: 90,
            content: makePdf('Penetration test', 'Scope and rules of engagement', [
              {
                heading: 'In scope',
                body: 'Web client, public API, object storage presigned URLs.',
              },
            ]),
          },
        ],
      },
      {
        name: 'release-checklist.txt',
        mime: TXT,
        shares: [{ to: 'sam', by: 'jack', role: 'viewer', hoursAgo: 28, expiresInDays: 5 }],
        opened: [{ by: 'sam', hoursAgo: 4 }],
        versions: [
          {
            by: 'jack',
            hoursAgo: 30,
            content: makeText('Release checklist', 1, [
              '[x] crypto tests pass',
              '[x] CSP headers',
              '[ ] audit anchor signed',
            ]),
          },
        ],
      },
      {
        name: 'supplier-list-old.csv',
        mime: CSV,
        trashed: { by: 'ilan', hoursAgo: 7 * 24 },
        versions: [
          {
            by: 'ilan',
            hoursAgo: 900,
            content: makeCsv(
              ['supplier', 'country', 'status'],
              [
                ['Acme Storage', 'NL', 'ended'],
                ['Ridgeway IT', 'DE', 'ended'],
              ],
            ),
          },
        ],
      },
    ],
    board: [
      {
        name: 'board-pack-q1.pdf',
        mime: PDF,
        versions: [
          {
            by: 'jack',
            hoursAgo: 500,
            content: makePdf('Board pack', 'Q1 2026', [
              { heading: 'Agenda', body: 'Security posture, budget, hiring.' },
            ]),
          },
        ],
      },
      {
        name: 'resolutions-draft.md',
        mime: MD,
        shares: [{ to: 'ilan', by: 'jack', role: 'editor', hoursAgo: 6 }],
        versions: [1, 2].map((rev, i) => ({
          by: 'jack' as Who,
          hoursAgo: 48 - i * 40,
          content: makeMarkdown('Resolutions (draft)', rev, [
            'Approve FY26 budget',
            'Appoint audit committee',
          ]),
        })),
      },
    ],
    deals: [
      {
        name: 'northgate-msa-final.pdf',
        mime: PDF,
        shares: [{ to: 'jack', by: 'maya', role: 'editor', hoursAgo: 2, expiresInDays: 30 }],
        versions: [1, 2].map((rev, i) => ({
          by: 'maya' as Who,
          hoursAgo: 120 - i * 100,
          note: ['Draft for Northgate', 'Signed copy'][i],
          content: makePdf('Master services agreement', `Northgate - final (rev ${rev})`, [
            {
              heading: 'Term',
              body: 'Two years from signature, renewing yearly unless cancelled in writing.',
            },
          ]),
        })),
      },
      {
        name: 'q2-budget-consolidated.csv',
        mime: CSV,
        shares: [
          { to: 'jack', by: 'ilan', role: 'viewer', hoursAgo: 26 },
          { to: 'sam', by: 'ilan', role: 'viewer', hoursAgo: 50, expiresInDays: 5 },
        ],
        opened: [{ by: 'sam', hoursAgo: 20 }],
        versions: [
          {
            by: 'ilan',
            hoursAgo: 60,
            content: makeCsv(
              ['team', 'q2_budget_eur', 'spent_eur'],
              [
                ['Legal', 120000, 64000],
                ['Engineering', 410000, 233000],
                ['Board', 30000, 8000],
              ],
            ),
          },
        ],
      },
    ],
    personal: [
      {
        name: 'personal-notes.md',
        mime: MD,
        versions: [
          {
            by: 'jack',
            hoursAgo: 12,
            content: makeMarkdown('Notes', 1, [
              'Renew passport',
              'Back up the recovery kit on paper',
            ]),
          },
        ],
      },
    ],
  }
}

type Base = Pick<MockDb, 'users' | 'vaults' | 'members'>

export async function seedFiles(
  base: Base,
  vaultIds: Record<string, string>,
  userIds: Record<Who, string>,
) {
  const files: MockFile[] = []
  const versions: MockVersion[] = []
  const chunks: MockChunk[] = []
  const wrappedKeys: MockWrappedKey[] = []
  const favorites: MockFavorite[] = []
  const access: MockAccess[] = []
  const shares: MockShare[] = []
  const links: MockLink[] = []
  const notifications: MockNotification[] = []
  const events: Omit<MockAudit, 'seq' | 'prevHash' | 'hash'>[] = []
  const now = Date.now()
  const at = (h: number) => new Date(now - h * 3_600_000).toISOString()

  for (const [vaultKey, list] of Object.entries(plan())) {
    const vaultId = vaultIds[vaultKey]
    const recipients = base.members
      .filter((m) => m.vaultId === vaultId)
      .map((m) => base.users.find((u) => u.id === m.userId)!)

    for (const seed of list) {
      const fileId = crypto.randomUUID()
      const holders = [
        ...recipients,
        ...(seed.shares ?? []).map((sh) => base.users.find((u) => u.id === userIds[sh.to])!),
      ]
      const ordered = [...seed.versions].sort((a, b) => b.hoursAgo - a.hoursAgo)
      let last: { enc: string; iv: string } = { enc: '', iv: '' }

      for (const [i, v] of ordered.entries()) {
        const versionId = crypto.randomUUID()
        const storagePfx = `v/${versionId}`
        const { key, raw } = await newDataKey()
        const sealed = await encryptChunk(key, v.content, chunkAad(fileId, versionId, 0))
        await putBlob(`${storagePfx}/0`, sealed.ciphertext)

        for (const r of holders) {
          wrappedKeys.push({
            versionId,
            userId: r.id,
            keyVersion: r.keyVersion,
            wrapped: await wrapDataKey(raw, r.publicKey),
          })
        }
        if (seed.link && i === ordered.length - 1) {
          const forLink = await sealForLink(raw, versionId, DEMO_LINK_KEY)
          const linkName = await encryptText(key, seed.name, nameAad(fileId))
          links.push({
            id: crypto.randomUUID(),
            token: DEMO_LINK_TOKEN,
            fileId,
            versionId,
            createdBy: userIds.jack,
            reWrapped: forLink.reWrapped,
            passphraseSalt: null,
            encName: linkName.enc,
            nameIv: linkName.iv,
            expiresAt: new Date(now + 30 * 86_400_000).toISOString(),
            maxDownloads: 25,
            downloads: 0,
            requireSignIn: false,
            allowDownload: true,
            revoked: false,
            createdAt: at(1),
          })
        }
        raw.fill(0)

        const note = v.note ? await encryptText(key, v.note, noteAad(versionId)) : null
        last = await encryptText(key, seed.name, nameAad(fileId))
        chunks.push({
          versionId,
          index: 0,
          iv: toBase64(sealed.iv),
          tag: toBase64(sealed.tag),
          digest: toBase64(sealed.digest),
        })
        versions.push({
          id: versionId,
          fileId,
          versionNo: i + 1,
          sizeBytes: v.content.length,
          chunkCount: 1,
          digest: toBase64(await versionDigest([sealed.digest])),
          encNote: note?.enc ?? null,
          noteIv: note?.iv ?? null,
          storagePfx,
          committed: true,
          createdAt: at(v.hoursAgo),
          createdBy: userIds[v.by],
        })
        events.push({
          timestamp: at(v.hoursAgo),
          actorId: userIds[v.by],
          action: i === 0 ? 'file.upload' : 'file.version',
          resourceType: 'file',
          resourceId: fileId,
        })
        access.push({ userId: userIds[v.by], fileId, action: 'upload', at: at(v.hoursAgo) })
      }

      const first = ordered[0]
      const latest = ordered[ordered.length - 1]
      files.push({
        id: fileId,
        vaultId,
        encName: last.enc,
        nameIv: last.iv,
        mimeType: seed.mime,
        ownerId: userIds[first.by],
        state: seed.trashed ? 'trashed' : 'active',
        deletedAt: seed.trashed ? at(seed.trashed.hoursAgo) : null,
        deletedBy: seed.trashed ? userIds[seed.trashed.by] : null,
        createdAt: at(first.hoursAgo),
        updatedAt: at(latest.hoursAgo),
      })
      if (seed.favorite) favorites.push({ userId: userIds.jack, fileId })
      for (const o of seed.opened ?? []) {
        access.push({ userId: userIds[o.by], fileId, action: 'download', at: at(o.hoursAgo) })
        events.push({
          timestamp: at(o.hoursAgo),
          actorId: userIds[o.by],
          action: 'file.download',
          resourceType: 'file',
          resourceId: fileId,
        })
      }
      for (const sh of seed.shares ?? []) {
        shares.push({
          fileId,
          userId: userIds[sh.to],
          role: sh.role,
          sharedBy: userIds[sh.by],
          sharedAt: at(sh.hoursAgo),
          expiresAt: sh.expiresInDays
            ? new Date(now + sh.expiresInDays * 86_400_000).toISOString()
            : null,
        })
        const by = base.users.find((u) => u.id === userIds[sh.by])!
        notifications.push({
          id: crypto.randomUUID(),
          userId: userIds[sh.to],
          key: 'share.received',
          category: 'share',
          title: `${by.displayName} shared {file} with you`,
          body: `${sh.role} · the data key is wrapped to your public key`,
          link: `/files/${fileId}`,
          fileId,
          read: sh.hoursAgo > 24,
          createdAt: at(sh.hoursAgo),
        })
        events.push({
          timestamp: at(sh.hoursAgo),
          actorId: userIds[sh.by],
          action: 'share.grant',
          resourceType: 'file',
          resourceId: fileId,
        })
      }
      if (seed.trashed) {
        events.push({
          timestamp: at(seed.trashed.hoursAgo),
          actorId: userIds[seed.trashed.by],
          action: 'file.trash',
          resourceType: 'file',
          resourceId: fileId,
        })
      }
    }
  }

  return {
    files,
    versions,
    chunks,
    wrappedKeys,
    favorites,
    access,
    shares,
    links,
    rekeys: [],
    notifications,
    audit: await chain(events),
  }
}

// the uploads above as an audit trail, hash-chained the same way appendAudit does it
async function chain(events: Omit<MockAudit, 'seq' | 'prevHash' | 'hash'>[]) {
  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const out: MockAudit[] = []
  let prevHash = '0'.repeat(64)
  for (const [i, e] of sorted.entries()) {
    const entry = { ...e, seq: i + 1 }
    const digest = await crypto.subtle.digest(
      'SHA-256',
      concatBytes(fromHex(prevHash), utf8(canonical(entry))),
    )
    const hash = toHex(new Uint8Array(digest))
    out.push({ ...entry, prevHash, hash })
    prevHash = hash
  }
  return out
}
