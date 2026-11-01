import { ASSET_STALE_MS } from '@/config/constants'
import type { AssetState, LocalizationStatus } from '@/types/tracking'

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'muted'

export interface LocalizationView {
  status: LocalizationStatus
  label: string
  tone: Tone
  message: string
  /** True only when a live position may be drawn as current. */
  hasLivePosition: boolean
}

/**
 * Frontend view of the localization state. A backend "estimated" result older
 * than ASSET_STALE_MS is shown as stale; a failing API is shown as
 * disconnected. Positions are never extrapolated.
 */
export function deriveLocalizationStatus(
  asset: AssetState | undefined,
  apiFailing: boolean,
  now: number,
  staleMs = ASSET_STALE_MS,
): LocalizationStatus {
  if (apiFailing) return 'api_disconnected'
  if (!asset) return 'unknown'
  if (asset.status === 'estimated') {
    if (asset.x === null || asset.y === null) return 'insufficient_data'
    if (asset.updatedAt === null || now - asset.updatedAt > staleMs) return 'stale'
  }
  // The backend reports insufficient_data both for missing telemetry and for missing models;
  // `receivers` lists fresh readings while `receivers_used` counts only calibrated ones.
  if (asset.status === 'insufficient_data') {
    const fresh = Object.keys(asset.receivers).length
    if (fresh >= 3 && (asset.receiversUsed ?? 0) < 3) return 'calibration_required'
  }
  return asset.status
}

const VIEWS: Record<LocalizationStatus, Omit<LocalizationView, 'status'>> = {
  estimated: {
    label: 'Estimated',
    tone: 'ok',
    message: 'Position estimated by the backend from RSSI range fitting.',
    hasLivePosition: true,
  },
  insufficient_data: {
    label: 'Insufficient data',
    tone: 'warn',
    message: 'Position unavailable — three calibrated receivers required.',
    hasLivePosition: false,
  },
  stale: {
    label: 'Stale telemetry',
    tone: 'warn',
    message: 'No fresh estimate. The last known position is historical and is not extrapolated.',
    hasLivePosition: false,
  },
  calibration_required: {
    label: 'Calibration required',
    tone: 'warn',
    message: 'Receivers need valid calibration models before a position can be estimated.',
    hasLivePosition: false,
  },
  api_disconnected: {
    label: 'API disconnected',
    tone: 'danger',
    message: 'The tracking API is not responding. Values shown are from the last successful update.',
    hasLivePosition: false,
  },
  unknown: {
    label: 'Unknown',
    tone: 'muted',
    message: 'Waiting for the first tracking result.',
    hasLivePosition: false,
  },
}

export function describeLocalization(status: LocalizationStatus): LocalizationView {
  return { status, ...VIEWS[status] }
}
