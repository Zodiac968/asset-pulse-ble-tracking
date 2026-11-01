export const RECEIVER_IDS = ['esp32-a', 'esp32-b', 'esp32-c'] as const
export type ReceiverId = (typeof RECEIVER_IDS)[number]

export interface Point2D {
  x: number
  y: number
}

export interface ReceiverPosition {
  x: number
  y: number
  z: number
}

export interface RoomDimensions {
  /** Along X, metres. */
  width: number
  /** Along Y, metres. */
  length: number
  /** Along Z, metres. */
  height: number
  /** Assumed (not measured) beacon height, metres. */
  asset_height: number
}

/** Exact shape accepted by PUT /config. */
export interface RoomConfiguration extends RoomDimensions {
  receivers: Record<ReceiverId, ReceiverPosition>
}

/** GET /config result after stripping DynamoDB metadata. */
export interface StoredRoomConfiguration {
  configuration: RoomConfiguration
  /** Epoch ms, when the backend supplied it. */
  updatedAt: number | null
}

export interface ConfigSaveResult {
  ok: boolean
  configuration: RoomConfiguration | null
  warning: string | null
}

export interface ValidationIssue {
  field: string
  message: string
  severity: 'error' | 'warning'
}
