import { Button, CipherNoise, SectionMark, Tag } from '@/components'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import styles from './LandingPage.module.css'

const MOMENTS = [
  {
    title: 'Key ceremony',
    text: 'On sign-up your browser generates an RSA-4096 pair. The private half is wrapped with a key derived from your password through Argon2id and only then stored. Twelve recovery words are shown once.',
    facts: ['RSA-4096-OAEP', 'Argon2id m=64 MiB', '12-word kit'],
  },
  {
    title: 'Upload',
    text: 'Each file gets a fresh AES-256-GCM data key and is encrypted in 4 MiB chunks before the first byte is sent. The data key is wrapped to your public key. File names are metadata, so they are encrypted too.',
    facts: ['AES-256-GCM', '4 MiB chunks', 'encrypted filenames'],
  },
  {
    title: 'Share',
    text: 'Granting access re-wraps that one data key to the recipient’s public key. Revoking deletes their copy. The plaintext key never exists outside a browser, so there is nothing for us to hand over.',
    facts: ['per-recipient wrap', 'RBAC + expiry', 'hash-chained audit'],
  },
]

const COMPARE = [
  [
    'Who holds the decryption key',
    'The vendor, in a KMS',
    'Your browser, derived from your password',
  ],
  ['What a subpoena can compel', 'Readable files', 'Ciphertext and a key nobody has'],
  ['What a breached database exposes', 'Everything, once', 'Random bytes and wrapped key blobs'],
  ['What a rogue admin can read', 'Anything, silently', 'Nothing, and the attempt is chained'],
  ['What happens when you revoke', 'A permission flag flips', 'Their wrapped key copy is deleted'],
]

export default function LandingPage() {
  useDocumentTitle('Zero-knowledge file collaboration')

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <SectionMark num="01">Zero-knowledge file collaboration</SectionMark>
          <h1 className={styles.display}>Files leave the browser already unreadable.</h1>
          <p className={styles.lead}>
            VaultShare encrypts every file in the tab it was chosen in. The server stores
            ciphertext, wrapped keys and an append-only audit chain — and nothing it holds is enough
            to read a single page of your work.
          </p>
          <div className={styles.cta}>
            <Button to="/signup" size="lg" className={styles.dark}>
              Create an account
            </Button>
            <Button to="/signin" size="lg" variant="ghost">
              Sign in
            </Button>
          </div>
          <p className={styles.stack}>
            AES-256-GCM · RSA-4096-OAEP · Argon2id · FIDO2 · no server-side key escrow
          </p>
        </div>

        <figure className={styles.request}>
          <div className={styles.requestHead}>
            <span>POST /api/v1/uploads/…/commit</span>
            <Tag tone="accent">Ciphertext</Tag>
          </div>
          <CipherNoise rows={13} cols={6} className={styles.requestNoise} />
          <dl className={styles.requestMeta}>
            <dt>iv</dt>
            <dd>9f3c1a77e0b45d2288ac31f0</dd>
            <dt>authTag</dt>
            <dd>5d41402abc4b2a76b9719d91</dd>
            <dt>key</dt>
            <dd className={styles.absent}>absent — never transmitted</dd>
          </dl>
          <figcaption>
            Actual request body shape. There is no field for a key because there is no key to send.
          </figcaption>
        </figure>
      </section>

      <section id="difference" className={styles.section}>
        <SectionMark num="02">The difference</SectionMark>
        <h2 className={styles.h2}>You see a contract. The server sees noise.</h2>
        <div className={styles.split}>
          <div className={styles.paper}>
            <span className={styles.panelLabel}>In your browser</span>
            <p className={styles.panelTitle}>contract-northgate-2026.pdf</p>
            <p className={styles.clause}>
              7.2 Either party may terminate this Agreement on ninety (90) days written notice to
              the other party, provided that all outstanding fees are settled in full prior to the
              effective date.
            </p>
            <Tag tone="accent">Decrypted locally</Tag>
          </div>
          <div className={styles.ink}>
            <span className={styles.panelLabel}>On our disks</span>
            <p className={styles.panelTitle}>obj_8Kq2f1a7c3</p>
            <CipherNoise rows={6} cols={6} className={styles.inkNoise} />
            <Tag tone="neutral">Indistinguishable from random</Tag>
          </div>
        </div>
        <p className={styles.caption}>
          Same file, same second. The left panel exists only in memory in your tab.
        </p>
      </section>

      <section id="how" className={styles.section}>
        <SectionMark num="03">How it works</SectionMark>
        <h2 className={styles.h2}>Three moments where most products leak.</h2>
        <ol className={styles.moments}>
          {MOMENTS.map((m, i) => (
            <li key={m.title} className={styles.moment}>
              <span className={styles.momentNum}>{String(i + 1).padStart(2, '0')}</span>
              <h3>{m.title}</h3>
              <p>{m.text}</p>
              <ul>
                {m.facts.map((f) => (
                  <li key={f}>— {f}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section id="compare" className={styles.section}>
        <SectionMark num="04">Against the usual claim</SectionMark>
        <h2 className={styles.h2}>“Encrypted at rest” is not encrypted from us.</h2>
        <table className={styles.compare}>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Question</span>
              </th>
              <th scope="col">Typical cloud storage</th>
              <th scope="col" className={styles.us}>
                VaultShare
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPARE.map(([q, them, us]) => (
              <tr key={q}>
                <th scope="row">{q}</th>
                <td>{them}</td>
                <td className={styles.usCell}>{us}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.band}>
        <div>
          <h2 className={styles.bandTitle}>Stop asking your vendor to be trustworthy.</h2>
          <p className={styles.bandText}>Make it structurally incapable of reading your files.</p>
          <Button to="/signup" size="lg">
            Create an account
          </Button>
        </div>
        <CipherNoise rows={10} cols={5} className={styles.bandNoise} />
      </section>
    </div>
  )
}
