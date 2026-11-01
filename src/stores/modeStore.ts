import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DataMode } from '@/types/api'

interface ModeState {
  /** null until the user explicitly chooses Live (Cognito) or Demo. */
  mode: DataMode | null
  setMode: (mode: DataMode | null) => void
}

export const useModeStore = create<ModeState>()(
  persist((set) => ({ mode: null, setMode: (mode) => set({ mode }) }), { name: 'assetpulse.mode' }),
)
