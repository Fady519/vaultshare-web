import { db } from './db'

// the mock's "SMTP": messages land in db.outbox and show up in the dev inbox panel
export function sendMail(
  to: string,
  subject: string,
  body: string,
  extra: { code?: string; link?: string } = {},
) {
  db.outbox.unshift({
    id: crypto.randomUUID(),
    to: to.toLowerCase(),
    subject,
    body,
    code: extra.code ?? null,
    link: extra.link ?? null,
    createdAt: new Date().toISOString(),
  })
  db.outbox = db.outbox.slice(0, 50)
}

export function sixDigitCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return String(n).padStart(6, '0')
}
