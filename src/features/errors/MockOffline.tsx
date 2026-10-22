import styles from './MockOffline.module.css'

// shown instead of the app when VITE_USE_MOCKS is on but the mock service worker isn't answering
export function MockOffline() {
  const origin = window.location.origin

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.code}>Dev setup</p>
        <h1 className={styles.title}>The mock server isn&apos;t running in this tab</h1>
        <p className={styles.text}>
          This build talks to a fake API inside the browser (a service worker). Something kept it
          from taking over this tab, so requests would go to a backend that isn&apos;t there and
          fail with “Internal Server Error”.
        </p>
        <ol className={styles.steps}>
          <li>
            Reload normally with <kbd>F5</kbd>. <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> and{' '}
            <kbd>Ctrl</kbd>+<kbd>F5</kbd> skip service workers on purpose.
          </li>
          <li>
            Another project may have left its own service worker on <code>{origin}</code>. Open
            DevTools → Application → Service workers, click <em>Unregister</em> on anything that
            isn&apos;t <code>mockServiceWorker.js</code>, and make sure “Bypass for network” is off.
          </li>
          <li>Close other tabs on this address, then reload.</li>
        </ol>
        <button type="button" className={styles.button} onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    </main>
  )
}
