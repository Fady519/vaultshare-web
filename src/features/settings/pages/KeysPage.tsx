import { useState } from 'react'
import { Button, Callout, Icon, SectionMark, SkeletonRows, Tag } from '@/components'
import { useKeyHistory, useMyKeys } from '@/api/settings'
import { fromBase64, toHex } from '@/crypto'
import { downloadText } from '@/utils/download'
import { formatDate } from '@/utils/format'
import { cx } from '@/utils/cx'
import { KeyDialog } from '../components/KeyDialogs'
import { SettingsLayout } from '../SettingsLayout'
import s from '../settings.module.css'
import styles from './KeysPage.module.css'

// figma 45
export default function KeysPage() {
  const keys = useMyKeys()
  const history = useKeyHistory()
  const [dialog, setDialog] = useState<'rotate' | 'kit' | null>(null)

  const k = keys.data
  const active = history.data?.find((h) => h.state === 'active')

  function exportPublic() {
    if (!k) return
    downloadText(
      `vaultshare-public-key-v${k.keyVersion}.txt`,
      `VaultShare public key (RSA-4096, SPKI, base64)\nfingerprint: ${k.fingerprint}\nversion: ${k.keyVersion}\n\n${k.publicKey}\n`,
    )
  }

  return (
    <SettingsLayout
      title="Encryption keys"
      crumb="Encryption keys"
      meta={
        k ? `RSA-4096  ·  created ${formatDate(k.createdAt)}  ·  fingerprint ${k.fingerprint}` : ' '
      }
      actions={
        <>
          <Button variant="ghost" icon="cog" onClick={() => setDialog('rotate')} disabled={!k}>
            Rotate key pair
          </Button>
          <Button variant="ghost" icon="down" onClick={exportPublic} disabled={!k}>
            Export public key
          </Button>
        </>
      }
    >
      {keys.isPending && <SkeletonRows rows={3} />}

      {k && (
        <section className={s.section}>
          <SectionMark num="01">Your key pair</SectionMark>
          <div className={styles.pair}>
            <div className={styles.key}>
              <div className={styles.keyHead}>
                <span>Public key</span>
                <Tag tone="accent">Published</Tag>
              </div>
              <code className={styles.blob}>{k.publicKey.slice(0, 120)}…</code>
              <p className={s.note}>anyone can hold this · people wrap file keys for you with it</p>
            </div>
            <div className={styles.key}>
              <div className={styles.keyHead}>
                <span>Private key</span>
                <Tag tone="warn">Sealed</Tag>
              </div>
              <code className={cx(styles.blob, styles.noise)}>
                {(toHex(fromBase64(k.sealedPrivateKey).slice(0, 36)).match(/.{4}/g) ?? []).join(
                  ' ',
                )}
              </code>
              <p className={s.note}>
                sealed with a key from your password · Argon2id m=64 MiB, t=3, p=4 · the server
                stores this blob and cannot open it
              </p>
            </div>
          </div>
        </section>
      )}

      <section className={s.section}>
        <SectionMark num="02">Recovery kit</SectionMark>
        <div className={s.row}>
          <span className={s.rowIcon}>
            <Icon name="key" />
          </span>
          <div className={s.rowText}>
            <p className={s.rowTitle}>Twelve words</p>
            <p className={s.rowSub}>
              a second sealed copy of your private key · the only way back if you forget your
              password
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setDialog('kit')}>
            Make a new kit
          </Button>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <SectionMark num="03">Key history</SectionMark>
          <span className={s.sectionNote}>rotation re-wraps everything onto the new key</span>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Version</th>
              <th>Fingerprint</th>
              <th>Algorithm</th>
              <th>Created</th>
              <th>Wrapped keys</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {(history.data ?? []).map((h) => (
              <tr key={h.keyVersion}>
                <td>v{h.keyVersion}</td>
                <td className={styles.mono}>{h.fingerprint}</td>
                <td className={styles.mono}>{h.algorithm}</td>
                <td className={styles.mono}>{formatDate(h.createdAt)}</td>
                <td className={styles.mono}>{h.wrappedCount}</td>
                <td>
                  <Tag
                    tone={
                      h.state === 'active' ? 'accent' : h.state === 'revoked' ? 'danger' : 'neutral'
                    }
                  >
                    {h.state}
                  </Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Callout tone="warn" icon="key" title="Rotation re-wraps, it does not re-encrypt">
        Your {active?.wrappedCount ?? '…'} data keys are unwrapped in this tab and wrapped again to
        the new public key. File ciphertext is untouched, so rotation takes seconds instead of a
        full re-upload. To make a key someone else kept useless, rotate the file keys themselves
        when you revoke access.
      </Callout>

      {dialog && <KeyDialog kind={dialog} onClose={() => setDialog(null)} />}
    </SettingsLayout>
  )
}
