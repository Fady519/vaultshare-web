import type { AuditAction, AuditEntryDto } from '@/api/types'
import { fromHex, toHex, utf8, concatBytes } from '@/crypto/encoding'
import { db } from './db'

const GENESIS = '0'.repeat(64)

/*
  Hash(n) = SHA-256( bytes(prevHash) || utf8(canonical json) )
  canonical json = keys in this exact order, no spaces. The real backend has
  to produce the same bytes, otherwise the browser-side verify (phase 6) fails.
*/
export function canonical(e: {
  seq: number
  timestamp: string
  actorId: string | null
  action: string
  resourceId: string
}) {
  return JSON.stringify({
    seq: e.seq,
    timestamp: e.timestamp,
    actorId: e.actorId,
    action: e.action,
    resourceId: e.resourceId,
  })
}

export async function appendAudit(
  actorId: string | null,
  action: AuditAction,
  resourceType: AuditEntryDto['resourceType'],
  resourceId: string,
) {
  const prev = db.audit[db.audit.length - 1]
  const prevHash = prev?.hash ?? GENESIS
  const entry = {
    seq: (prev?.seq ?? 0) + 1,
    timestamp: new Date().toISOString(),
    actorId,
    action,
    resourceType,
    resourceId,
  }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    concatBytes(fromHex(prevHash), utf8(canonical(entry))),
  )
  db.audit.push({ ...entry, prevHash, hash: toHex(new Uint8Array(digest)) })
}
