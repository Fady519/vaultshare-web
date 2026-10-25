import { ErrorState } from '@/components'
import styles from './MockOffline.module.css'

export function UnsupportedBrowser({ missing }: { missing: string[] }) {
  const insecure = missing.includes('secure context')

  return (
    <main className={styles.page}>
      <ErrorState
        tone="warn"
        icon="shield"
        code="unsupported browser"
        title={insecure ? 'Open VaultShare over HTTPS' : 'This browser can’t do the cryptography'}
      >
        {insecure ? (
          <>
            Browsers only offer Web Crypto on HTTPS pages and on localhost. This address is plain{' '}
            HTTP ({window.location.host}), so there is no safe way to derive or unwrap your keys
            here.
          </>
        ) : (
          <>
            Files are encrypted and decrypted on this device, and this browser is missing{' '}
            {missing.join(', ')}. VaultShare won’t fall back to anything weaker: use a current
            Chrome, Edge, Firefox or Safari.
          </>
        )}
      </ErrorState>
    </main>
  )
}
