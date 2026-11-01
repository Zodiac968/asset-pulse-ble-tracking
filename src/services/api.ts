/**
 * Live API Gateway client. All HTTP calls in the app go through here.
 * Requests carry the Cognito *access* token as a Bearer token; tokens are
 * never logged or surfaced in the UI.
 */
import { env } from '@/config/env'
import { ApiError, type TrackingApi } from '@/types/api'
import type { RoomConfiguration } from '@/types/room'
import {
  extractErrorMessage,
  normalizeAction,
  normalizeAsset,
  normalizeCalibrationStart,
  normalizeCalibrationStatus,
  normalizeConfigSave,
  normalizeFit,
  normalizeHealth,
  normalizeModelSet,
  normalizePointStart,
  normalizeStoredConfig,
  toConfigPayload,
} from './normalize'

const DEFAULT_TIMEOUT_MS = 10_000

export interface LiveApiOptions {
  baseUrl?: string
  getAccessToken: () => string | null
  onUnauthorized?: () => void
  timeoutMs?: number
}

type Method = 'GET' | 'PUT' | 'POST'

export function createLiveApi(options: LiveApiOptions): TrackingApi {
  const baseUrl = (options.baseUrl ?? env.apiBaseUrl).replace(/\/+$/, '')
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function request(method: Method, path: string, body?: unknown): Promise<unknown> {
    if (!baseUrl) throw new ApiError('config', 'VITE_API_BASE_URL is not configured.')
    const token = options.getAccessToken()
    if (!token) {
      options.onUnauthorized?.()
      throw new ApiError('unauthorized', 'Not signed in. Please sign in again.', 401)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch (err) {
      if (controller.signal.aborted) throw new ApiError('timeout', `Request to ${path} timed out after ${timeoutMs / 1000}s.`)
      throw new ApiError('network', `Cannot reach API Gateway (${path}). Check the network, API URL and CORS settings.`)
    } finally {
      clearTimeout(timer)
    }

    const text = await res.text()
    let parsed: unknown = null
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = text
      }
    }

    if (!res.ok) {
      const apiMessage = extractErrorMessage(parsed)
      if (res.status === 401) {
        options.onUnauthorized?.()
        throw new ApiError('unauthorized', apiMessage ?? 'Session expired or token rejected (401).', 401)
      }
      if (res.status === 403)
        throw new ApiError('forbidden', apiMessage ?? 'Not authorized for this action (403). A required scope may be missing.', 403)
      throw new ApiError('http', apiMessage ?? `${method} ${path} failed with HTTP ${res.status}.`, res.status)
    }
    if (typeof parsed === 'string') throw new ApiError('parse', `${method} ${path} returned a non-JSON response.`, res.status)
    return parsed
  }

  const wrap = <T>(path: string, fn: (b: unknown) => T) => (b: unknown) => {
    try {
      return fn(b)
    } catch (err) {
      throw new ApiError('parse', err instanceof Error ? err.message : `Unexpected response from ${path}.`)
    }
  }

  return {
    mode: 'live',
    getHealth: () => request('GET', '/health').then(wrap('/health', normalizeHealth)),
    getAsset: () => request('GET', '/asset').then(wrap('/asset', normalizeAsset)),
    getConfig: () => request('GET', '/config').then(wrap('/config', normalizeStoredConfig)),
    putConfig: (config: RoomConfiguration) =>
      request('PUT', '/config', toConfigPayload(config)).then(wrap('/config', normalizeConfigSave)),
    getCalibrationModels: () => request('GET', '/calibration/models').then(wrap('/calibration/models', normalizeModelSet)),
    getCalibrationStatus: () => request('GET', '/calibration/status').then(wrap('/calibration/status', (b) => normalizeCalibrationStatus(b))),
    startCalibration: () => request('POST', '/calibration/start', {}).then(wrap('/calibration/start', normalizeCalibrationStart)),
    startCalibrationPoint: (p) =>
      request('POST', '/calibration/point', { x: p.x, y: p.y }).then(wrap('/calibration/point', normalizePointStart)),
    stopCalibrationPoint: () => request('POST', '/calibration/stop', {}).then(wrap('/calibration/stop', normalizeAction)),
    // The backend fits the latest session and ignores the body; the session ID is sent for clarity.
    fitCalibration: (sessionId) =>
      request('POST', '/calibration/fit', sessionId ? { session_id: sessionId } : {}).then(wrap('/calibration/fit', normalizeFit)),
    applyCalibration: (sessionId) =>
      request('POST', '/calibration/apply', { session_id: sessionId }).then(wrap('/calibration/apply', normalizeAction)),
  }
}
