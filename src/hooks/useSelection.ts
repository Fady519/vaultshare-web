import { useMemo, useRef, useState } from 'react'

/*
  Ticked rows of a list, file-manager style: shift extends from the last
  row you clicked. Ids that leave the list (trashed, moved) drop out by themselves.
*/
export function useSelection(ids: string[]) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const anchor = useRef<string | null>(null)
  const key = ids.join(',')

  const selected = useMemo(
    () => new Set([...picked].filter((id) => ids.includes(id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [picked, key],
  )

  function toggle(id: string, on: boolean, shift = false) {
    // read the anchor now: the updater below runs later, after it has moved on
    const from = anchor.current ? ids.indexOf(anchor.current) : -1
    const to = ids.indexOf(id)
    setPicked((prev) => {
      const next = new Set([...prev].filter((x) => ids.includes(x)))
      if (shift && from >= 0 && to >= 0) {
        const [a, b] = from < to ? [from, to] : [to, from]
        for (let i = a; i <= b; i++) {
          if (on) next.add(ids[i])
          else next.delete(ids[i])
        }
      } else if (on) next.add(id)
      else next.delete(id)
      return next
    })
    anchor.current = id
  }

  return {
    selected,
    toggle,
    setAll: (on: boolean) => setPicked(on ? new Set(ids) : new Set()),
    clear: () => setPicked(new Set()),
  }
}
