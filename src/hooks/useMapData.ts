import { useMemo } from 'react'
import { RECEIVER_META, RECEIVER_STALE_MS } from '@/config/constants'
import type { DistanceCircle, MapAsset } from '@/components/room/types'
import { useHistoryStore } from '@/stores/historyStore'
import { useUiStore } from '@/stores/uiStore'
import { RECEIVER_IDS, type ReceiverId } from '@/types/room'
import { rssiToDistance } from '@/utils/signal'
import { useAssetTracking } from './useAssetTracking'
import { useCalibrationModels } from './useCalibration'
import { useReceiverStatus } from './useReceiverStatus'
import { useRoomConfiguration, useZones } from './useRoomConfiguration'

/**
 * Everything both maps render, derived once from shared state so the 2D and
 * 3D views can never disagree.
 */
export function useMapData() {
  const room = useRoomConfiguration()
  const { config } = room
  const { zones, sites } = useZones(config)
  const tracking = useAssetTracking()
  const { receivers, onlineCount } = useReceiverStatus()
  const models = useCalibrationModels()
  const trail = useHistoryStore((s) => s.trail)
  const showCircles = useUiStore((s) => s.showCircles)
  const showTrail = useUiStore((s) => s.showTrail)

  const { asset, view, now } = tracking

  const mapAsset: MapAsset | null = useMemo(() => {
    if (!asset || asset.x === null || asset.y === null) {
      // Show the last trail point as a clearly historical marker.
      const last = trail[trail.length - 1]
      return last ? { x: last.x, y: last.y, live: false, updatedAt: last.t } : null
    }
    return { x: asset.x, y: asset.y, live: view.hasLivePosition, updatedAt: asset.updatedAt }
  }, [asset, view.hasLivePosition, trail])

  /**
   * The backend identifies the receiver geometrically nearest to the estimated
   * point; we highlight that Voronoi zone. Strongest RSSI is never used here.
   */
  const activeZoneId: ReceiverId | null = useMemo(() => {
    if (!asset || !view.hasLivePosition) return null
    const nr = asset.nearestReceiver
    if (nr && (RECEIVER_IDS as readonly string[]).includes(nr)) return nr as ReceiverId
    const byName = RECEIVER_IDS.find((id) => RECEIVER_META[id].zone === asset.currentZone)
    return byName ?? null
  }, [asset, view.hasLivePosition])

  const circles: DistanceCircle[] = useMemo(() => {
    if (!showCircles || !asset) return []
    const out: DistanceCircle[] = []
    for (const id of RECEIVER_IDS) {
      const obs = asset.receivers[id]
      const model = models.data?.models[id]
      const rssi = obs?.filteredRssi ?? obs?.rssi ?? null
      if (!obs?.updatedAt || now - obs.updatedAt > RECEIVER_STALE_MS || rssi === null || model?.p0 == null || model.n == null) continue
      const d = rssiToDistance(rssi, model.p0, model.n)
      if (d === null) continue
      const r = config.receivers[id]
      const dz = config.asset_height - r.z
      const horizontal = Math.sqrt(Math.max(0, d * d - dz * dz))
      out.push({ receiverId: id, x: r.x, y: r.y, r: horizontal, color: RECEIVER_META[id].color })
    }
    return out
  }, [showCircles, asset, models.data, now, config])

  return {
    room,
    config,
    zones,
    sites,
    tracking,
    receivers,
    onlineCount,
    asset: mapAsset,
    activeZoneId,
    trail: showTrail ? trail : [],
    circles,
    hasModels: Boolean(models.data && Object.keys(models.data.models).length),
  }
}
