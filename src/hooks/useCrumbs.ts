import { useEffect } from 'react'
import { useUi, type Crumb } from '@/store/ui'

// sets the topbar breadcrumbs and the tab title for the current page
export function useCrumbs(...crumbs: (Crumb | string)[]) {
  const setCrumbs = useUi((s) => s.setCrumbs)
  const items = crumbs.map((c) => (typeof c === 'string' ? { label: c } : c))
  const key = JSON.stringify(items)

  useEffect(() => {
    const parsed = JSON.parse(key) as Crumb[]
    setCrumbs(parsed)
    const last = parsed[parsed.length - 1]
    document.title = last ? `${last.label} · VaultShare` : 'VaultShare'
  }, [key, setCrumbs])
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · VaultShare`
  }, [title])
}
