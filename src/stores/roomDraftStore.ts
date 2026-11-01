import { create } from 'zustand'
import type { ReceiverId, ReceiverPosition, RoomConfiguration, RoomDimensions } from '@/types/room'
import { cloneConfig } from '@/utils/coordinates'

/**
 * Unsaved edits to the room configuration. The saved configuration itself is
 * server state (TanStack Query); while `draft` is non-null, both maps render
 * the draft so 2D, 3D and the forms always share one source of truth.
 */
interface RoomDraftState {
  draft: RoomConfiguration | null
  begin: (from: RoomConfiguration) => void
  discard: () => void
  updateDimensions: (patch: Partial<RoomDimensions>) => void
  updateReceiver: (id: ReceiverId, patch: Partial<ReceiverPosition>) => void
  replace: (config: RoomConfiguration) => void
}

export const useRoomDraftStore = create<RoomDraftState>()((set) => ({
  draft: null,
  begin: (from) => set((s) => (s.draft ? s : { draft: cloneConfig(from) })),
  discard: () => set({ draft: null }),
  updateDimensions: (patch) => set((s) => (s.draft ? { draft: { ...s.draft, ...patch } } : s)),
  updateReceiver: (id, patch) =>
    set((s) =>
      s.draft
        ? { draft: { ...s.draft, receivers: { ...s.draft.receivers, [id]: { ...s.draft.receivers[id], ...patch } } } }
        : s,
    ),
  replace: (config) => set({ draft: cloneConfig(config) }),
}))
