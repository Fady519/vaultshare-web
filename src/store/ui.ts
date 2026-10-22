import { create } from 'zustand'

export type Crumb = { label: string; to?: string }

type UiState = {
  crumbs: Crumb[]
  setCrumbs: (crumbs: Crumb[]) => void
}

export const useUi = create<UiState>((set) => ({
  crumbs: [],
  setCrumbs: (crumbs) => set({ crumbs }),
}))
