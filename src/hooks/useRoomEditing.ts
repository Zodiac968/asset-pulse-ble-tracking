import { useSession } from '@/components/auth/SessionProvider'
import { DEFAULT_ROOM } from '@/config/constants'
import { useRoomDraftStore } from '@/stores/roomDraftStore'
import { receiversMoved } from '@/utils/coordinates'
import { useRoomConfiguration, useSaveConfig } from './useRoomConfiguration'

/** Edit Mode = an unsaved draft exists. Live Mode = positions locked to the saved config. */
export function useRoomEditing() {
  const room = useRoomConfiguration()
  const saveMutation = useSaveConfig()
  const begin = useRoomDraftStore((s) => s.begin)
  const discard = useRoomDraftStore((s) => s.discard)
  const { canWrite } = useSession()

  const moved = room.draft && room.saved ? receiversMoved(room.draft, room.saved) : false

  return {
    ...room,
    canWrite,
    moved,
    saving: saveMutation.isPending,
    startEditing: () => begin(room.saved ?? DEFAULT_ROOM),
    discardEdits: discard,
    canSave: Boolean(room.draft) && room.dirty && room.errors.length === 0 && canWrite && !saveMutation.isPending,
    save: () => {
      // Guard against overlapping saves.
      if (!room.draft || saveMutation.isPending || room.errors.length > 0) return
      saveMutation.mutate(room.draft)
    },
    reload: () => {
      discard()
      void room.query.refetch()
    },
  }
}
