import { create } from 'zustand'

export type ToastTone = 'ok' | 'warn' | 'danger' | 'info'

export type ToastItem = {
  id: number
  tone: ToastTone
  message: string
}

type ToastState = {
  items: ToastItem[]
  push: (message: string, tone?: ToastTone) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToasts = create<ToastState>((set) => ({
  items: [],
  push: (message, tone = 'info') => {
    const id = nextId++
    set((s) => ({ items: [...s.items, { id, tone, message }] }))
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), 4500)
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}))

// usable outside react too (api client, mutations)
export const toast = (message: string, tone?: ToastTone) =>
  useToasts.getState().push(message, tone)
