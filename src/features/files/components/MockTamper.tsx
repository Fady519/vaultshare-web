import { useEffect, useState } from 'react'
import { queryClient } from '@/api/queryClient'
import { mocksOn, tamperState, toggleTamper } from '@/mocks/devClient'
import styles from '@/features/auth/components/MockHelper.module.css'

/*
  Dev only: flips one byte of chunk 1 in the mock object storage, so the
  integrity check can be shown failing. A real bucket has no such switch.
*/
export function MockTamper({ versionId }: { versionId: string }) {
  const [tampered, setTampered] = useState<boolean | null>(null)

  useEffect(() => {
    if (!mocksOn) return
    let alive = true
    tamperState(versionId).then((t) => alive && setTampered(t))
    return () => {
      alive = false
    }
  }, [versionId])

  if (!mocksOn || tampered === null) return null

  async function flip() {
    setTampered(await toggleTamper(versionId))
    // decrypt again from storage
    queryClient.resetQueries({ queryKey: ['plaintext', versionId] })
  }

  return (
    <aside className={styles.box}>
      <span className={styles.tag}>Mock server · object storage</span>
      <p className={styles.text}>
        {tampered
          ? 'One byte of chunk 1 is flipped in storage right now. Decrypting this version must fail.'
          : 'Flip one byte of chunk 1 in storage to see what a tampered object looks like.'}
      </p>
      <button type="button" className={styles.action} onClick={flip}>
        {tampered ? 'Put the byte back' : 'Tamper with chunk 1'}
      </button>
    </aside>
  )
}
