import type { ReceiverId } from './room'

/** Localization states the UI can present. */
export type LocalizationStatus =
  | 'estimated'
  | 'insufficient_data'
  | 'stale'
  | 'calibration_required'
  | 'api_disconnected'
  | 'unknown'

export interface ReceiverObservation {
  receiverId: string
  rssi: number | null
  filteredRssi: number | null
  packets: number | null
  /** Epoch ms of the observation. */
  updatedAt: number | null
}

/** Normalized GET /asset result. */
export interface AssetState {
  /** Status string as reported by the backend, mapped onto known states. */
  status: LocalizationStatus
  /** The raw backend status string, for diagnostics. */
  rawStatus: string | null
  x: number | null
  y: number | null
  currentZone: string | null
  nearestReceiver: string | null
  receiversUsed: number | null
  rangeResidualRmseM: number | null
  method: string | null
  updatedAt: number | null
  beaconId: string | null
  assetId: string | null
  message: string | null
  receivers: Partial<Record<ReceiverId, ReceiverObservation>> & Record<string, ReceiverObservation | undefined>
}

export interface HealthStatus {
  ok: boolean
  raw: Record<string, unknown> | null
}

/** Derived (frontend) connectivity state of a receiver. */
export type ReceiverLink =
  | 'online' // fresh beacon observation
  | 'no_recent' // observed before, but nothing recent
  | 'offline' // nothing observed for a long time / never observed
  | 'unconfigured'

export interface ReceiverView {
  id: ReceiverId
  label: string
  short: string
  color: string
  configured: boolean
  position: { x: number; y: number; z: number } | null
  link: ReceiverLink
  observation: ReceiverObservation | null
  lastSeen: number | null
  ageMs: number | null
}

export type SessionEventKind =
  | 'position'
  | 'zone'
  | 'stale'
  | 'resumed'
  | 'status'
  | 'calibration'
  | 'config'
  | 'error'

export interface SessionEvent {
  id: string
  t: number
  kind: SessionEventKind
  message: string
  tone: 'info' | 'ok' | 'warn' | 'danger'
}
