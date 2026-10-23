import { create } from 'zustand'

export type ToastTone = 'ok' | 'warn' | 'danger' | 'info'

export type ToastAction = { label: string; onClick: () => void }

export type ToastItem = {
  id: number
  tone: ToastTone
  message: string
  action?: ToastAction
}

type ToastState = {
  items: ToastItem[]
  push: (message: string, tone?: ToastTone, action?: ToastAction) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToasts = create<ToastState>((set) => ({
  items: [],
  push: (message, tone = 'info', action) => {
    const id = nextId++
    set((s) => ({ items: [...s.items, { id, tone, message, action }] }))
    // a toast with an undo stays a bit longer
    setTimeout(
      () => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
      action ? 8000 : 4500,
    )
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}))

// usable outside react too (api client, mutations)
export const toast = (message: string, tone?: ToastTone, action?: ToastAction) =>
  useToasts.getState().push(message, tone, action)
