import { describe, expect, it } from 'vitest'
import type { AuditEntryDto } from '@/api/types'
import { entryHash, GENESIS, verifyChain } from './auditChain'

async function chain(n: number) {
  const out: AuditEntryDto[] = []
  let prev = GENESIS
  for (let seq = 1; seq <= n; seq++) {
    const e = {
      seq,
      timestamp: `2026-10-22T09:00:0${seq}.000Z`,
      actorId: seq % 2 ? 'a90b0000-0000-0000-0000-000000000001' : null,
      actorName: null,
      action: 'file.upload' as const,
      resourceType: 'file' as const,
      resourceId: '7c1e0000-0000-0000-0000-000000000002',
      prevHash: prev,
      hash: '',
    }
    e.hash = await entryHash(e, prev)
    prev = e.hash
    out.push(e)
  }
  return out
}

describe('audit chain', () => {
  it('verifies an untouched log end to end', async () => {
    const log = await chain(5)
    const r = await verifyChain(log, true)
    expect(r).toMatchObject({ ok: true, checked: 5, headSeq: 5 })
  })

  it('finds an edited entry, even in a slice', async () => {
    const log = await chain(5)
    log[2] = { ...log[2], action: 'file.download' }
    expect(await verifyChain(log, true)).toMatchObject({ ok: false, brokenAt: 3, reason: 'hash' })
    expect(await verifyChain([log[2], log[4]], false)).toMatchObject({ ok: false, brokenAt: 3 })
  })

  it('finds a deleted entry and a re-hashed edit in the full log', async () => {
    const log = await chain(5)
    expect(await verifyChain([...log.slice(0, 2), ...log.slice(3)], true)).toMatchObject({
      ok: false,
      brokenAt: 3,
      reason: 'gap',
    })
    // an attacker who also recomputes the edited entry's own hash still breaks the next link
    const edited = { ...log[1], action: 'file.download' as const }
    edited.hash = await entryHash(edited, edited.prevHash)
    const forged = [log[0], edited, ...log.slice(2)]
    expect(await verifyChain(forged, true)).toMatchObject({
      ok: false,
      brokenAt: 3,
      reason: 'link',
    })
  })
})
