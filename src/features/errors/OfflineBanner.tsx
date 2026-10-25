import { useEffect, useRef } from 'react'
import { Icon, toast } from '@/components'
import { useOnline } from '@/hooks/useOnline'
import styles from './OfflineBanner.module.css'

// figma 51. offline is a state, not an error: what's decrypted stays decrypted
export function OfflineBanner() {
  const online = useOnline()
  const wasOffline = useRef(false)

  useEffect(() => {
    if (!online) wasOffline.current = true
    else if (wasOffline.current) {
      wasOffline.current = false
      toast('Back online. Lists are refreshing.', 'ok')
    }
  }, [online])

  return (
    <div role="status" className={styles.slot}>
      {!online && (
        <div className={styles.banner}>
          <Icon name="shield" className={styles.icon} />
          <p>
            <strong>Offline.</strong> Files already decrypted in this tab stay readable. Uploads,
            shares and refreshes wait for the connection; nothing leaves this device meanwhile.
          </p>
        </div>
      )}
    </div>
  )
}
