import { useEffect } from 'react'
import { toast } from '@/components'
import { IDLE_MINUTES, useSession } from '@/store/session'

const ACTIVITY = ['pointerdown', 'keydown', 'mousemove', 'wheel', 'touchstart'] as const

// FR-06: after 15 idle minutes the private key is dropped from memory
export function useIdleLock() {
  useEffect(() => {
    let lastTouch = 0

    function onActivity() {
      const now = Date.now()
      // no need to update the store on every mouse move
      if (now - lastTouch > 10_000) {
        lastTouch = now
        useSession.getState().touch()
      }
    }

    const timer = setInterval(() => {
      const { privateKey, lockAt, lock } = useSession.getState()
      if (privateKey && lockAt && Date.now() >= lockAt) {
        lock()
        toast(`Locked after ${IDLE_MINUTES} idle minutes. Your keys were cleared from memory.`)
      }
    }, 5_000)

    ACTIVITY.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    return () => {
      clearInterval(timer)
      ACTIVITY.forEach((e) => window.removeEventListener(e, onActivity))
    }
  }, [])
}
