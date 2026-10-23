import { create } from 'zustand'

export type Crumb = { label: string; to?: string }

type UiState = {
  crumbs: Crumb[]
  setCrumbs: (crumbs: Crumb[]) => void
  // kept here, not in the URL: the words someone searches for are as private as the names
  searchQuery: string
  setSearchQuery: (q: string) => void
}

export const useUi = create<UiState>((set) => ({
  crumbs: [],
  setCrumbs: (crumbs) => set({ crumbs }),
  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}))
