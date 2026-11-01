import { useMemo } from 'react'
import { useHistoryStore } from '@/stores/historyStore'
import { buildReceiverViews } from '@/utils/receivers'
import { useAssetQuery } from './useAssetTracking'
import { useNow } from './useNow'
import { useRoomConfiguration } from './useRoomConfiguration'

export function useReceiverStatus() {
  const { config } = useRoomConfiguration()
  const { data: asset } = useAssetQuery()
  const lastSeen = useHistoryStore((s) => s.lastSeen)
  const now = useNow()
  const receivers = useMemo(() => buildReceiverViews(config, asset, lastSeen, now), [config, asset, lastSeen, now])
  return {
    receivers,
    onlineCount: receivers.filter((r) => r.link === 'online').length,
    total: receivers.length,
  }
}
