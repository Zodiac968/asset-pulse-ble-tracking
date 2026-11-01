import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useApi } from '@/app/ApiProvider'
import { DEFAULT_ROOM, RECEIVER_META } from '@/config/constants'
import { useHistoryStore } from '@/stores/historyStore'
import { useRoomDraftStore } from '@/stores/roomDraftStore'
import { RECEIVER_IDS, type RoomConfiguration } from '@/types/room'
import { errorMessage } from '@/types/api'
import { configsEqual, validateRoom } from '@/utils/coordinates'
import { computeZones, type ZoneSite } from '@/utils/voronoi'
import { queryKeys } from './queryKeys'

export function useConfigQuery() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.config(api.mode),
    queryFn: () => api.getConfig(),
    staleTime: 30_000,
  })
}

/**
 * The room as currently displayed: the unsaved draft if editing, otherwise
 * the backend configuration. Falls back to defaults (flagged) only when the
 * backend configuration could not be loaded.
 */
export function useRoomConfiguration() {
  const query = useConfigQuery()
  const draft = useRoomDraftStore((s) => s.draft)
  const saved = query.data?.configuration ?? null
  const config: RoomConfiguration = draft ?? saved ?? DEFAULT_ROOM
  const dirty = draft !== null && !configsEqual(draft, saved)
  const issues = useMemo(() => validateRoom(config), [config])
  return {
    config,
    saved,
    savedAt: query.data?.updatedAt ?? null,
    draft,
    dirty,
    editing: draft !== null,
    usingDefaults: !draft && !saved,
    issues,
    errors: issues.filter((i) => i.severity === 'error'),
    warnings: issues.filter((i) => i.severity === 'warning'),
    query,
  }
}

/** Memoized Voronoi zones for the current room/receivers. */
export function useZones(config: RoomConfiguration) {
  const r = config.receivers
  const key = RECEIVER_IDS.map((id) => `${r[id].x},${r[id].y}`).join('|') + `|${config.width}x${config.length}`
  return useMemo(() => {
    const sites: ZoneSite[] = RECEIVER_IDS.map((id) => ({
      id,
      name: RECEIVER_META[id].zone,
      color: RECEIVER_META[id].color,
      x: r[id].x,
      y: r[id].y,
    }))
    return { sites, zones: computeZones(sites, config.width, config.length) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

export function useSaveConfig() {
  const api = useApi()
  const qc = useQueryClient()
  const discard = useRoomDraftStore((s) => s.discard)
  const log = useHistoryStore((s) => s.log)
  return useMutation({
    mutationKey: ['config', 'save', api.mode],
    mutationFn: (config: RoomConfiguration) => api.putConfig(config),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error('The backend did not confirm the configuration save.')
        return
      }
      await qc.invalidateQueries({ queryKey: queryKeys.config(api.mode) })
      await qc.invalidateQueries({ queryKey: queryKeys.asset(api.mode) })
      discard()
      log('config', 'Room configuration updated', 'ok')
      toast.success('Room configuration saved')
      if (result.warning) toast.warning(result.warning, { duration: 10_000 })
    },
    onError: (err) => toast.error(`Save failed: ${errorMessage(err)}`),
  })
}
