import type { Point2D, ReceiverId, RoomConfiguration } from '@/types/room'
import type { CalibrationPoint } from '@/types/calibration'
import type { ReceiverView } from '@/types/tracking'
import type { Zone } from '@/utils/voronoi'
import type { TrailPoint } from '@/stores/historyStore'
import type { Selection } from '@/stores/uiStore'

/** Asset marker input. `live` = a current backend estimate; otherwise historical. */
export interface MapAsset {
  x: number
  y: number
  live: boolean
  updatedAt: number | null
}

/** Model-derived range estimate around a receiver (an estimate, not a measurement). */
export interface DistanceCircle {
  receiverId: ReceiverId
  x: number
  y: number
  r: number
  color: string
}

export interface CalibrationOverlay {
  target: Point2D | null
  points: CalibrationPoint[]
  activePointId: string | null
}

/** Props shared by the 2D and 3D maps so both render the same state. */
export interface RoomMapProps {
  config: RoomConfiguration
  zones: Zone[]
  receivers: ReceiverView[]
  asset: MapAsset | null
  activeZoneId: string | null
  selection: Selection
  onSelect: (s: Selection) => void
  showGrid: boolean
  showZones: boolean
  trail?: TrailPoint[]
  circles?: DistanceCircle[]
  calibration?: CalibrationOverlay
}
