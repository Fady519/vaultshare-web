import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

// what the browser believes. it can say "online" on a dead wifi, never the reverse
export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine)
}
