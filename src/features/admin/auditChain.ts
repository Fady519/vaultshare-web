import type { AuditEntryDto } from '@/api/types'

/*
  FR-21: the audit chain checked in the browser. Every entry commits to the one
  before it:  hash(n) = SHA-256( bytes(prevHash) ‖ UTF-8(canonical json) ).
  The canonical form must match the backend byte for byte (roadmap 10.8).

  - full log (admins, auditors): every hash is recomputed AND every prevHash must
    equal the hash before it, starting from 64 zeros. Any edit, deletion or
    insertion shows up at the first seq where it happened.
  - a slice (one vault, my own events): there are gaps between entries, so only
    each entry's own hash can be recomputed. That still catches an edited entry.
*/

export const GENESIS = '0'.repeat(64)

export function canonical(
  e: Pick<AuditEntryDto, 'seq' | 'timestamp' | 'actorId' | 'action' | 'resourceId'>,
) {
  return JSON.stringify({
    seq: e.seq,
    timestamp: e.timestamp,
    actorId: e.actorId,
    action: e.action,
    resourceId: e.resourceId,
  })
}

const hexToBytes = (hex: string) =>
  Uint8Array.from(hex.match(/.{2}/g) ?? [], (b) => parseInt(b, 16))
const bytesToHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

export async function entryHash(e: Parameters<typeof canonical>[0], prevHash: string) {
  const prev = hexToBytes(prevHash)
  const body = new TextEncoder().encode(canonical(e))
  const data = new Uint8Array(prev.length + body.length)
  data.set(prev)
  data.set(body, prev.length)
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
}

export type ChainResult =
  | {
      ok: true
      checked: number
      headSeq: number | null
      headHash: string | null
      complete: boolean
    }
  | {
      ok: false
      checked: number
      brokenAt: number
      reason: 'hash' | 'link' | 'gap'
      complete: boolean
    }

export async function verifyChain(
  entries: AuditEntryDto[],
  complete: boolean,
): Promise<ChainResult> {
  const asc = [...entries].sort((a, b) => a.seq - b.seq)
  let checked = 0
  for (const [i, e] of asc.entries()) {
    if (complete) {
      const expectedSeq = i + 1
      if (e.seq !== expectedSeq)
        return { ok: false, checked, brokenAt: expectedSeq, reason: 'gap', complete }
      const expectedPrev = i === 0 ? GENESIS : asc[i - 1].hash
      if (e.prevHash !== expectedPrev)
        return { ok: false, checked, brokenAt: e.seq, reason: 'link', complete }
    }
    if ((await entryHash(e, e.prevHash)) !== e.hash) {
      return { ok: false, checked, brokenAt: e.seq, reason: 'hash', complete }
    }
    checked++
  }
  const head = asc[asc.length - 1]
  return { ok: true, checked, headSeq: head?.seq ?? null, headHash: head?.hash ?? null, complete }
}
