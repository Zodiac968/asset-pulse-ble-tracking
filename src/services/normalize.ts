/**
 * API normalization layer.
 *
 * Every assumption about API Gateway responses lives in this file. Shapes
 * below are confirmed against the backend handlers (api_lambda.py,
 * localization_lambda.py, common.py). Missing values become `null`; nothing
 * is fabricated.
 *
 *   GET  /health              -> { ok, server_time }
 *   GET  /asset               -> { status: "estimated" | "insufficient_data", x, y, current_zone,
 *                                  nearest_receiver?, receivers_used, range_residual_rmse_m?, method?,
 *                                  updated_at (time of computation, not observation), beacon_id, asset_id,
 *                                  receivers: { [id]: RX# item, only readings <= STALE_MS (20 s) old } }
 *   GET  /config              -> ROOM item incl. PK, SK, updated_at (absent while defaults are served)
 *   PUT  /config              -> { ok, configuration (item), warning (always set) }
 *   GET  /calibration/models  -> { [id]: { p0, n, rmse_db, accepted: true, session_id, updated_at } | null }
 *   GET  /calibration/status  -> { state: "none", points: [] }
 *                              | { session: { session_id, state, created_at }, points: [{ point_id, x, y, counts }] }
 *   POST /calibration/start   -> { ok, session_id, state }
 *   POST /calibration/point   -> { ok, point_id, expires_at }
 *   POST /calibration/stop    -> { ok }
 *   POST /calibration/fit     -> { session_id, models: { [id]: model | { accepted: false, error } } }
 *   POST /calibration/apply   -> { ok, applied: [ids] }
 *   errors                    -> 400 { error } (validation), 500 { error: "Internal server error" }
 *
 * Backend caveat: session.state becomes "sampling" when the first point starts
 * and is never reset, so it is NOT treated as "a point is collecting".
 */
import { DEFAULT_ROOM } from '@/config/constants'
import { RECEIVER_IDS, type ConfigSaveResult, type RoomConfiguration, type StoredRoomConfiguration } from '@/types/room'
import type { AssetState, HealthStatus, LocalizationStatus, ReceiverObservation } from '@/types/tracking'
import type {
  CalibrationActionResult,
  CalibrationFitResult,
  CalibrationModel,
  FitMeasurement,
  CalibrationModelSet,
  CalibrationPoint,
  CalibrationPointStartResult,
  CalibrationSession,
  CalibrationStartResult,
  CalibrationStatus,
} from '@/types/calibration'
import { toMillis } from '@/utils/time'

type Json = Record<string, unknown>

export function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asObject(v: unknown): Json {
  return isObject(v) ? v : {}
}

export function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() !== '') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

function bool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}

function first(obj: Json, keys: string[]): unknown {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k]
  return undefined
}

/** Extract `{ error }`/`{ message }` from an error body. */
export function extractErrorMessage(body: unknown): string | null {
  if (typeof body === 'string') return body.slice(0, 300) || null
  if (!isObject(body)) return null
  const msg = str(body.error) ?? str(body.message) ?? str(body.Message) ?? str(asObject(body.error).message)
  return msg ? msg.slice(0, 300) : null
}

export function normalizeHealth(body: unknown): HealthStatus {
  const o = asObject(body)
  const status = str(o.status)?.toLowerCase()
  // A 2xx response with no recognizable status field counts as healthy.
  const ok = bool(o.ok) ?? (status ? ['ok', 'healthy', 'up', 'pass'].includes(status) : true)
  return { ok, raw: isObject(body) ? body : null }
}

const STATUS_MAP: Record<string, LocalizationStatus> = {
  estimated: 'estimated',
  ok: 'estimated',
  insufficient_data: 'insufficient_data',
  insufficient: 'insufficient_data',
  no_data: 'insufficient_data',
  stale: 'stale',
  stale_telemetry: 'stale',
  calibration_required: 'calibration_required',
  uncalibrated: 'calibration_required',
  not_calibrated: 'calibration_required',
}

export function mapLocalizationStatus(raw: string | null): LocalizationStatus {
  if (!raw) return 'unknown'
  return STATUS_MAP[raw.toLowerCase()] ?? 'unknown'
}

function normalizeObservation(id: string, v: unknown): ReceiverObservation {
  const o = asObject(v)
  return {
    receiverId: str(o.receiver_id) ?? id,
    rssi: num(o.rssi),
    filteredRssi: num(first(o, ['filtered_rssi', 'rssi_filtered', 'filteredRssi'])),
    packets: num(first(o, ['packets', 'packet_count'])),
    updatedAt: toMillis(first(o, ['updated_at', 'timestamp', 'ts', 'last_seen'])),
  }
}

export function normalizeAsset(body: unknown): AssetState {
  const o = asObject(body)
  const rawStatus = str(o.status)
  let x = num(o.x)
  let y = num(o.y)
  const position = asObject(o.position)
  if (x === null && y === null && isObject(o.position)) {
    x = num(position.x)
    y = num(position.y)
  }
  const status = mapLocalizationStatus(rawStatus)
  // Only an "estimated" result may carry a position.
  if (status !== 'estimated') {
    x = null
    y = null
  }
  const receivers: AssetState['receivers'] = {}
  const rx = o.receivers
  if (isObject(rx)) {
    for (const [id, v] of Object.entries(rx)) receivers[id] = normalizeObservation(id, v)
  } else if (Array.isArray(rx)) {
    for (const v of rx) {
      const id = str(asObject(v).receiver_id)
      if (id) receivers[id] = normalizeObservation(id, v)
    }
  }
  const zone = str(o.current_zone)
  return {
    status,
    rawStatus,
    x,
    y,
    currentZone: zone && zone.toLowerCase() !== 'unknown' ? zone : null,
    nearestReceiver: str(o.nearest_receiver),
    receiversUsed: num(o.receivers_used),
    rangeResidualRmseM: num(o.range_residual_rmse_m),
    method: str(o.method),
    updatedAt: toMillis(o.updated_at),
    beaconId: str(o.beacon_id),
    assetId: str(o.asset_id),
    message: str(o.message) ?? str(o.reason) ?? str(o.detail),
    receivers,
  }
}

/**
 * Parse a room configuration; returns null if required fields are missing.
 * Only known room fields are read, so DynamoDB metadata (PK, SK, updated_at…)
 * never leaks into room properties.
 */
export function parseRoomConfiguration(body: unknown): RoomConfiguration | null {
  const o = asObject(isObject(asObject(body).configuration) ? asObject(body).configuration : body)
  const width = num(o.width)
  const length = num(o.length)
  const height = num(o.height)
  const assetHeight = num(first(o, ['asset_height', 'assetHeight']))
  if (width === null || length === null || height === null) return null
  const rx = asObject(o.receivers)
  const receivers = {} as RoomConfiguration['receivers']
  for (const id of RECEIVER_IDS) {
    const r = asObject(rx[id])
    const x = num(r.x)
    const y = num(r.y)
    const z = num(r.z)
    receivers[id] =
      x !== null && y !== null
        ? { x, y, z: z ?? DEFAULT_ROOM.receivers[id].z }
        : { ...DEFAULT_ROOM.receivers[id] }
  }
  return { width, length, height, asset_height: assetHeight ?? DEFAULT_ROOM.asset_height, receivers }
}

export function normalizeStoredConfig(body: unknown): StoredRoomConfiguration {
  const configuration = parseRoomConfiguration(body)
  if (!configuration) throw new Error('GET /config returned an incomplete room configuration (width/length/height missing).')
  const o = asObject(body)
  return { configuration, updatedAt: toMillis(o.updated_at ?? asObject(o.configuration).updated_at) }
}

/** Build the exact PUT /config payload (no metadata, all three receivers). */
export function toConfigPayload(c: RoomConfiguration): RoomConfiguration {
  const receivers = {} as RoomConfiguration['receivers']
  for (const id of RECEIVER_IDS) receivers[id] = { x: c.receivers[id].x, y: c.receivers[id].y, z: c.receivers[id].z }
  return { width: c.width, length: c.length, height: c.height, asset_height: c.asset_height, receivers }
}

export function normalizeConfigSave(body: unknown): ConfigSaveResult {
  const o = asObject(body)
  return {
    ok: bool(o.ok) ?? true,
    configuration: parseRoomConfiguration(o.configuration),
    warning: str(o.warning),
  }
}


// ---------------------------------------------------------------- Calibration

function countRecord(v: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (isObject(v)) {
    for (const [k, val] of Object.entries(v)) {
      const n = num(val)
      if (n !== null) out[k] = n
    }
  }
  return out
}

function normalizePoint(v: unknown, index: number, active: { pointId: string; collecting: boolean } | null): CalibrationPoint {
  const o = asObject(v)
  const pointId = str(first(o, ['point_id', 'pointId', 'id'])) ?? `point-${index + 1}`
  const std = countRecord(o.std_rssi)
  return {
    pointId,
    label: `P${index + 1}`,
    x: num(o.x) ?? 0,
    y: num(o.y) ?? 0,
    counts: countRecord(o.counts),
    stdRssi: Object.keys(std).length ? std : null,
    active: bool(o.active) ?? (active ? active.collecting && active.pointId === pointId : null),
  }
}

function normalizeSession(v: unknown): CalibrationSession | null {
  if (!isObject(v)) return null
  const sessionId = str(first(v, ['session_id', 'sessionId']))
  if (!sessionId) return null
  return { sessionId, status: str(first(v, ['state', 'status'])), createdAt: toMillis(v.created_at), raw: v }
}

/**
 * The current backend's status response does not say which point is
 * collecting. If it ever includes the CAL_ACTIVE record as `active`
 * ({ point_id, state, expires_at }), it is used here; otherwise point
 * activity stays null and the UI relies on the POST /calibration/point
 * response (point_id + expires_at).
 */
export function normalizeCalibrationStatus(body: unknown, now = Date.now()): CalibrationStatus {
  const o = asObject(body)
  const session = normalizeSession(o.session)
  let active: { pointId: string; collecting: boolean } | null = null
  if (isObject(o.active)) {
    const pid = str(o.active.point_id)
    const expires = toMillis(o.active.expires_at)
    if (pid) active = { pointId: pid, collecting: str(o.active.state) === 'collecting' && (expires === null || expires > now) }
  }
  const points = Array.isArray(o.points) ? o.points.map((p, i) => normalizePoint(p, i, active)) : []
  return { session, points, state: str(o.state), error: extractErrorMessage(o.error ? o : null) }
}

export function normalizeCalibrationStart(body: unknown): CalibrationStartResult {
  const o = asObject(body)
  const sessionId = str(first(o, ['session_id', 'sessionId']))
  if (!sessionId) throw new Error('POST /calibration/start did not return a session ID.')
  return { sessionId, raw: o }
}

export function normalizePointStart(body: unknown): CalibrationPointStartResult {
  const o = asObject(body)
  return { pointId: str(o.point_id), expiresAt: toMillis(o.expires_at), message: str(o.message) ?? str(o.warning), raw: o }
}

export function normalizeAction(body: unknown): CalibrationActionResult {
  const o = asObject(body)
  const applied = Array.isArray(o.applied) ? `Activated: ${o.applied.join(', ')}.` : null
  return { ok: bool(o.ok) ?? true, message: str(o.message) ?? applied, raw: o }
}

function normalizeMeasurements(v: unknown): FitMeasurement[] | null {
  if (!Array.isArray(v)) return null
  const out: FitMeasurement[] = []
  for (const p of v) {
    const o = asObject(p)
    const distance = num(o.distance)
    const medianRssi = num(o.median_rssi)
    if (distance !== null && medianRssi !== null) out.push({ distance, medianRssi, count: num(o.count) ?? 0 })
  }
  return out
}

/**
 * Fit results: { accepted: false, valid, p0, n, rmse_db, points: [{distance, count, median_rssi}], warning }
 * or, when a receiver lacks data, { accepted: false, error }. `accepted` means
 * "activated", NOT "valid". Applied models (GET /calibration/models) carry
 * accepted: true, session_id and updated_at.
 */
function normalizeModel(id: string, v: unknown): CalibrationModel {
  const o = asObject(v)
  const error = str(o.error)
  const measurements = normalizeMeasurements(o.points)
  const accepted = bool(o.accepted)
  return {
    receiverId: id,
    p0: num(o.p0),
    n: num(o.n),
    rmseDb: num(o.rmse_db),
    samples: measurements ? measurements.reduce((a, m) => a + m.count, 0) : null,
    valid: bool(o.valid) ?? (error ? false : accepted === true ? true : null),
    accepted,
    reason: error ?? str(o.warning),
    measurements,
    updatedAt: toMillis(o.updated_at),
    sessionId: str(o.session_id),
  }
}

/** Receiver models keyed by receiver ID, under `models` (fit) or at the top level (GET /calibration/models). */
function modelsFrom(o: Json): Record<string, CalibrationModel> {
  const src = isObject(o.models) ? o.models : o
  const out: Record<string, CalibrationModel> = {}
  for (const [k, v] of Object.entries(src)) {
    // null = no model stored for this receiver.
    if (isObject(v) && /^esp32-/i.test(k)) out[k] = normalizeModel(k, v)
  }
  return out
}

export function normalizeModelSet(body: unknown): CalibrationModelSet {
  const models = modelsFrom(asObject(body))
  const list = Object.values(models)
  const times = list.map((m) => m.updatedAt).filter((t): t is number => t !== null)
  return {
    models,
    sessionId: list.find((m) => m.sessionId)?.sessionId ?? null,
    appliedAt: times.length ? Math.max(...times) : null,
  }
}

export function normalizeFit(body: unknown): CalibrationFitResult {
  const o = asObject(body)
  const models = modelsFrom(o)
  return {
    sessionId: str(o.session_id),
    models,
    // Mirrors POST /calibration/apply: every receiver needs a model that passed validation.
    allValid: RECEIVER_IDS.every((id) => models[id]?.valid === true),
    message: str(o.message) ?? str(o.warning),
    raw: o,
  }
}
