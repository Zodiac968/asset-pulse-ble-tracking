import type { AssetState, HealthStatus } from './tracking'
import type { ConfigSaveResult, RoomConfiguration, StoredRoomConfiguration } from './room'
import type {
  CalibrationActionResult,
  CalibrationFitResult,
  CalibrationModelSet,
  CalibrationPointStartResult,
  CalibrationStartResult,
  CalibrationStatus,
} from './calibration'

export type DataMode = 'live' | 'demo'

/**
 * Common interface implemented by the live API Gateway client and the demo
 * simulator. Both return normalized types produced by services/normalize.ts.
 */
export interface TrackingApi {
  readonly mode: DataMode
  getHealth(): Promise<HealthStatus>
  getAsset(): Promise<AssetState>
  getConfig(): Promise<StoredRoomConfiguration>
  putConfig(config: RoomConfiguration): Promise<ConfigSaveResult>
  getCalibrationModels(): Promise<CalibrationModelSet>
  getCalibrationStatus(): Promise<CalibrationStatus>
  startCalibration(): Promise<CalibrationStartResult>
  startCalibrationPoint(point: { x: number; y: number }): Promise<CalibrationPointStartResult>
  stopCalibrationPoint(): Promise<CalibrationActionResult>
  fitCalibration(sessionId: string | null): Promise<CalibrationFitResult>
  applyCalibration(sessionId: string): Promise<CalibrationActionResult>
}

export type ApiErrorKind = 'network' | 'timeout' | 'unauthorized' | 'forbidden' | 'http' | 'config' | 'parse'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null

  constructor(kind: ApiErrorKind, message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Unexpected error'
}
