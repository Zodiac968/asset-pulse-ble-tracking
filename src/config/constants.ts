import type { ReceiverId, RoomConfiguration } from '@/types/room'

export const APP_NAME = 'AssetPulse'
export const APP_SUBTITLE = 'Indoor Asset Tracking & Localization'

export const BEACON = {
  name: 'Asset 01',
  model: 'ISC-Beacon-V01',
  mac: 'B4:A7:24:16:BA:8A',
  advertisingIntervalMs: 2000,
} as const

export const DEFAULT_ROOM: RoomConfiguration = {
  width: 6,
  length: 4,
  height: 3,
  asset_height: 1,
  receivers: {
    'esp32-a': { x: 0.5, y: 0.5, z: 1 },
    'esp32-b': { x: 5.5, y: 0.5, z: 1 },
    'esp32-c': { x: 3.0, y: 3.5, z: 1 },
  },
}

export interface ReceiverMeta {
  id: ReceiverId
  label: string
  short: string
  zone: string
  color: string
}

export const RECEIVER_META: Record<ReceiverId, ReceiverMeta> = {
  'esp32-a': { id: 'esp32-a', label: 'ESP32 A', short: 'A', zone: 'Zone A', color: '#0891b2' },
  'esp32-b': { id: 'esp32-b', label: 'ESP32 B', short: 'B', zone: 'Zone B', color: '#8b5cf6' },
  'esp32-c': { id: 'esp32-c', label: 'ESP32 C', short: 'C', zone: 'Zone C', color: '#d97706' },
}

export const ROOM_LIMITS = {
  minSide: 1,
  maxSide: 100,
  minHeight: 1,
  maxHeight: 20,
} as const

/** Observation age after which a receiver is shown as "no recent observations".
 *  Matches the backend's STALE_MS (common.py), which also drops older readings from GET /asset. */
export const RECEIVER_STALE_MS = 20_000
/** Observation age after which a receiver is treated as offline. */
export const RECEIVER_OFFLINE_MS = 120_000
/** Asset result age after which the position is treated as stale. GET /asset computes on
 *  demand (updated_at = computation time), so this only trips if polling stalls. */
export const ASSET_STALE_MS = 20_000

export const REFRESH_INTERVAL_OPTIONS = [2000, 2500, 3000, 5000] as const
export const DEFAULT_REFRESH_MS = 2500

export const RSSI_HISTORY_LIMIT = 400
export const TRAIL_LIMIT = 40
export const EVENT_LIMIT = 120

/** Calibration guidance thresholds (UI warnings only; backend validation is authoritative). */
export const CALIBRATION = {
  recommendedPoints: 5,
  recommendedSamplesPerReceiver: 30,
  minSamplesPerReceiver: 15,
  /** Backend fit skips a position with fewer samples than this for a receiver (api_lambda.fit_model). */
  backendMinSamplesPerPoint: 8,
  /** Backend fit requires at least this many positions. */
  minFitPoints: 3,
  backendWindowS: 120,
  nRange: [1.5, 4.5] as [number, number],
  maxGoodRmseDb: 6,
  maxStdDb: 6,
  p0Range: [-90, -30] as [number, number],
}
