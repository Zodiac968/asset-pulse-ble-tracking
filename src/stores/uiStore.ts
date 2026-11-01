import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_REFRESH_MS } from '@/config/constants'
import type { ReceiverId } from '@/types/room'

export type MapView = '2d' | '3d'
export type Selection = { kind: 'receiver'; id: ReceiverId } | { kind: 'asset' } | null

interface UiState {
  selection: Selection
  view: MapView
  showGrid: boolean
  showZones: boolean
  showCircles: boolean
  showTrail: boolean
  snapToGrid: boolean
  snapStep: number
  refreshMs: number
  defaultView: MapView
  setSelection: (s: Selection) => void
  setView: (v: MapView) => void
  set: (patch: Partial<Omit<UiState, 'set' | 'setSelection' | 'setView'>>) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      selection: null,
      view: '2d',
      showGrid: true,
      showZones: true,
      showCircles: false,
      showTrail: true,
      snapToGrid: true,
      snapStep: 0.1,
      refreshMs: DEFAULT_REFRESH_MS,
      defaultView: '2d',
      setSelection: (selection) => set({ selection }),
      setView: (view) => set({ view }),
      set: (patch) => set(patch),
    }),
    {
      name: 'assetpulse.ui',
      // Persist preferences only; selection is per-visit.
      partialize: (s) => ({
        showGrid: s.showGrid,
        showZones: s.showZones,
        showCircles: s.showCircles,
        showTrail: s.showTrail,
        snapToGrid: s.snapToGrid,
        snapStep: s.snapStep,
        refreshMs: s.refreshMs,
        defaultView: s.defaultView,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.view = state.defaultView
      },
    },
  ),
)
