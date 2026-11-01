import type { ReceiverId } from './room'

export interface CalibrationPoint {
  /** Backend point ID (opaque hex string). */
  pointId: string
  /** Display label in creation order: P1, P2, … */
  label: string
  x: number
  y: number
  /** Sample counts keyed by receiver ID. */
  counts: Record<string, number>
  /** RSSI standard deviation per receiver, only if the backend supplies it. */
  stdRssi: Record<string, number> | null
  /** Whether the backend indicates this point is currently being sampled. null = backend did not say. */
  active: boolean | null
}

export interface CalibrationSession {
  sessionId: string
  /** Raw session state. NOTE: the backend sets "sampling" on the first point and never resets it,
   *  so it does not mean a point is currently being collected. */
  status: string | null
  createdAt: number | null
  raw: Record<string, unknown>
}

export interface CalibrationStatus {
  session: CalibrationSession | null
  points: CalibrationPoint[]
  /** Top-level `state` when the backend returns it (e.g. "none"). */
  state: string | null
  error: string | null
}

/** One per-point measurement used by the backend fit (median RSSI at a known distance). */
export interface FitMeasurement {
  distance: number
  count: number
  medianRssi: number
}

export interface CalibrationModel {
  receiverId: string
  p0: number | null
  n: number | null
  rmseDb: number | null
  /** Samples used by the fit (sum of per-point counts), when known. */
  samples: number | null
  /** Passed backend validation. A model with an `error` and no `valid` flag is invalid. */
  valid: boolean | null
  /** Activated on the backend (true only for applied models; fit results report false). */
  accepted: boolean | null
  reason: string | null
  /** Points the backend actually used for this receiver's fit. */
  measurements: FitMeasurement[] | null
  updatedAt: number | null
  sessionId: string | null
}

export interface CalibrationModelSet {
  models: Partial<Record<ReceiverId, CalibrationModel>> & Record<string, CalibrationModel | undefined>
  sessionId: string | null
  appliedAt: number | null
}

export interface CalibrationFitResult {
  sessionId: string | null
  models: Record<string, CalibrationModel>
  /** True only when every receiver's model is reported valid. */
  allValid: boolean
  message: string | null
  raw: Record<string, unknown>
}

export interface CalibrationActionResult {
  ok: boolean
  message: string | null
  raw: Record<string, unknown>
}

export interface CalibrationStartResult {
  sessionId: string
  raw: Record<string, unknown>
}

export interface CalibrationPointStartResult {
  pointId: string | null
  /** Backend end of the collection window (epoch ms), from `expires_at`. */
  expiresAt: number | null
  message: string | null
  raw: Record<string, unknown>
}
