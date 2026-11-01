/**
 * Demo Mode simulator.
 *
 * A self-contained mock of the real backend (api_lambda.py /
 * localization_lambda.py): same response shapes, same validation rules and
 * error messages, same 20 s reading freshness. Responses pass through the
 * same normalizers as live data, so every UI path is exercised identically.
 *
 * In Demo Mode the asset follows *known simulated coordinates*; the reported
 * position is that simulated position plus noise, not a recovery from RSSI.
 * RSSI is synthesized from a log-distance model so charts, calibration and
 * diagnostics behave plausibly.
 */
import { BEACON, DEFAULT_ROOM, RECEIVER_META } from '@/config/constants'
import { ApiError, type TrackingApi } from '@/types/api'
import { RECEIVER_IDS, type Point2D, type ReceiverId, type RoomConfiguration } from '@/types/room'
import { clamp, cloneConfig, distance3D, roundTo, validateRoom } from '@/utils/coordinates'
import { mean, rssiToDistance } from '@/utils/signal'
import { computeZones, nearestSite } from '@/utils/voronoi'
import {
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

type Json = Record<string, unknown>

interface Reading {
  rssi: number
  filtered: number
  times: number[]
  updatedAt: number
}

interface DemoPoint {
  pointId: string
  x: number
  y: number
  createdAt: number
  samples: Record<ReceiverId, number[]>
}

interface StoredModel {
  p0: number
  n: number
  rmse_db: number
  session_id: string
  updated_at: number
}

type FitOutput = Record<ReceiverId, Json>

export interface DemoSnapshot {
  truePosition: Point2D
  target: Point2D | null
  wander: boolean
  receiverEnabled: Record<ReceiverId, boolean>
  signalLoss: boolean
  room: RoomConfiguration
}

/** Physical "ground truth" propagation per receiver (unknown to the UI). */
const TRUE_PROPAGATION: Record<ReceiverId, { p0: number; n: number }> = {
  'esp32-a': { p0: -59, n: 2.25 },
  'esp32-b': { p0: -61, n: 2.4 },
  'esp32-c': { p0: -58, n: 2.15 },
}

const TICK_MS = 500
/** Backend STALE_MS (common.py). */
const STALE_MS = 20_000
const COLLECT_MS = 120_000
const SPEED_MPS = 0.35
const NOISE_DB = 2.4

function gaussian(): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('')
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Same as the backend's `raise ValueError(...)` → 400 { error }. */
function valueError(message: string): never {
  throw new ApiError('http', message, 400)
}

class DemoSimulator {
  private room: RoomConfiguration = cloneConfig(DEFAULT_ROOM)
  private roomUpdatedAt: number | null = Date.now() - 3600_000
  private pos: Point2D = { x: 2.2, y: 1.6 }
  private target: Point2D | null = null
  private waypoint: Point2D = { x: 4.2, y: 2.6 }
  private wander = true
  private holdUntil = 0
  private enabled: Record<ReceiverId, boolean> = { 'esp32-a': true, 'esp32-b': true, 'esp32-c': true }
  private signalLoss = false
  private readings: Partial<Record<ReceiverId, Reading>> = {}
  private nextAdvAt = 0

  /** SYSTEM/MODEL#<id> — pre-seeded so the demo can localize immediately. */
  private models: Partial<Record<ReceiverId, StoredModel>> = {
    'esp32-a': { p0: -58.6, n: 2.31, rmse_db: 1.2, session_id: 'demo00000000', updated_at: Date.now() - 3000_000 },
    'esp32-b': { p0: -61.4, n: 2.36, rmse_db: 1.4, session_id: 'demo00000000', updated_at: Date.now() - 3000_000 },
    'esp32-c': { p0: -57.7, n: 2.19, rmse_db: 1.1, session_id: 'demo00000000', updated_at: Date.now() - 3000_000 },
  }

  /** SYSTEM/CAL_SESSION — like the backend, state goes ready → sampling and is never reset. */
  private session: { session_id: string; state: 'ready' | 'sampling'; created_at: number } | null = null
  private points: DemoPoint[] = []
  /** SYSTEM/CAL_ACTIVE */
  private active: { pointId: string; state: 'collecting' | 'stopped'; expiresAt: number } | null = null
  /** SYSTEM/CAL_RESULT */
  private result: { sessionId: string; models: FitOutput } | null = null

  private listeners = new Set<() => void>()
  private snapshot: DemoSnapshot
  private timer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.snapshot = this.buildSnapshot()
  }

  start() {
    if (this.timer) return
    // Produce the first observations immediately so the first poll has data.
    this.tick(Date.now())
    this.timer = setInterval(() => this.tick(Date.now()), TICK_MS)
  }

  // ------------------------------------------------------------ demo controls

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = () => this.snapshot

  private emit() {
    this.snapshot = this.buildSnapshot()
    this.listeners.forEach((l) => l())
  }

  private buildSnapshot(): DemoSnapshot {
    return {
      truePosition: { ...this.pos },
      target: this.target ? { ...this.target } : null,
      wander: this.wander,
      receiverEnabled: { ...this.enabled },
      signalLoss: this.signalLoss,
      room: this.room,
    }
  }

  moveAssetTo(p: Point2D) {
    this.target = { x: clamp(p.x, 0, this.room.width), y: clamp(p.y, 0, this.room.length) }
    this.wander = false
    this.emit()
  }

  chooseZone(receiverId: ReceiverId) {
    const z = computeZones(this.sites(), this.room.width, this.room.length).find((zone) => zone.receiverId === receiverId)
    if (z?.centroid) this.moveAssetTo(z.centroid)
  }

  setWander(on: boolean) {
    this.wander = on
    if (on) this.target = null
    this.emit()
  }

  setReceiverEnabled(id: ReceiverId, on: boolean) {
    this.enabled = { ...this.enabled, [id]: on }
    this.emit()
  }

  setSignalLoss(on: boolean) {
    this.signalLoss = on
    this.emit()
  }

  restoreNormal() {
    this.enabled = { 'esp32-a': true, 'esp32-b': true, 'esp32-c': true }
    this.signalLoss = false
    this.wander = true
    this.target = null
    this.emit()
  }

  // ------------------------------------------------------------ simulation

  private sites() {
    return RECEIVER_IDS.map((id) => ({
      id,
      name: RECEIVER_META[id].zone,
      color: RECEIVER_META[id].color,
      x: this.room.receivers[id].x,
      y: this.room.receivers[id].y,
    }))
  }

  private collecting(now: number) {
    return this.active?.state === 'collecting' && this.active.expiresAt > now ? this.active : null
  }

  private tick(now: number) {
    const dt = TICK_MS / 1000
    const goal = this.target ?? (this.wander ? this.waypoint : null)
    if (goal && now > this.holdUntil) {
      const dx = goal.x - this.pos.x
      const dy = goal.y - this.pos.y
      const d = Math.hypot(dx, dy)
      const step = SPEED_MPS * dt
      if (d <= step) {
        this.pos = { ...goal }
        if (!this.target && this.wander) {
          const m = 0.35
          this.waypoint = {
            x: m + Math.random() * Math.max(0.1, this.room.width - 2 * m),
            y: m + Math.random() * Math.max(0.1, this.room.length - 2 * m),
          }
          this.holdUntil = now + 2000 + Math.random() * 5000
        }
      } else {
        this.pos = { x: this.pos.x + (dx / d) * step, y: this.pos.y + (dy / d) * step }
      }
    }

    // Beacon advertises every ~2 s; each receiver hears ~90% of advertisements.
    if (now >= this.nextAdvAt) {
      this.nextAdvAt = now + BEACON.advertisingIntervalMs + (Math.random() - 0.5) * 60
      const point = this.collecting(now)
      for (const id of RECEIVER_IDS) {
        if (!this.enabled[id] || this.signalLoss || Math.random() > 0.9) continue
        const r = this.room.receivers[id]
        const d = Math.max(0.2, distance3D({ ...this.pos, z: this.room.asset_height }, r))
        const { p0, n } = TRUE_PROPAGATION[id]
        const rssi = Math.round(p0 - 10 * n * Math.log10(d) + gaussian() * NOISE_DB)
        const prev = this.readings[id]
        const filtered = prev && now - prev.updatedAt < STALE_MS ? prev.filtered + 0.3 * (rssi - prev.filtered) : rssi
        const times = [...(prev?.times ?? []).filter((t) => now - t < 6000), now]
        this.readings[id] = { rssi, filtered: roundTo(filtered, 1), times, updatedAt: now }
        if (point) this.points.find((p) => p.pointId === point.pointId)?.samples[id].push(rssi)
      }
    }
    this.emit()
  }

  /** common.readings(): receivers with a reading no older than STALE_MS. */
  private freshReadings(now: number): Partial<Record<ReceiverId, Reading>> {
    const out: Partial<Record<ReceiverId, Reading>> = {}
    for (const id of RECEIVER_IDS) {
      const r = this.readings[id]
      if (r && now - r.updatedAt <= STALE_MS) out[id] = r
    }
    return out
  }

  // ------------------------------------------------------------ API surface (raw backend shapes)

  async getHealth() {
    await delay(80)
    return { ok: true, server_time: Date.now() }
  }

  /** localization_lambda.compute(): computed on demand; updated_at is the computation time. */
  async getAsset() {
    await delay(60 + Math.random() * 80)
    const now = Date.now()
    const live = this.freshReadings(now)
    const usable = (Object.keys(live) as ReceiverId[]).filter((id) => this.models[id])
    const receivers: Json = {}
    for (const [id, r] of Object.entries(live) as [ReceiverId, Reading][]) {
      receivers[id] = { PK: 'ASSET#01', SK: `RX#${id}`, receiver_id: id, rssi: r.rssi, filtered_rssi: r.filtered, packets: r.times.length, updated_at: r.updatedAt }
    }
    const base = { updated_at: now, beacon_id: BEACON.mac, asset_id: 'ASSET#01', receivers }
    if (usable.length < 3) return { status: 'insufficient_data', x: null, y: null, current_zone: 'Unknown', receivers_used: usable.length, ...base }

    const est = {
      x: roundTo(clamp(this.pos.x + gaussian() * 0.1, 0, this.room.width), 3),
      y: roundTo(clamp(this.pos.y + gaussian() * 0.1, 0, this.room.length), 3),
    }
    // Range residual against model-derived distances (a consistency measure, not accuracy).
    const residuals = usable.map((id) => {
      const m = this.models[id]!
      const d = clamp(rssiToDistance(live[id]!.filtered, m.p0, m.n) ?? 0, 0.1, 100)
      return distance3D({ ...est, z: this.room.asset_height }, this.room.receivers[id]) - d
    })
    const nearest = nearestSite(est, this.sites())!
    return {
      status: 'estimated',
      ...est,
      current_zone: RECEIVER_META[nearest.id].zone,
      nearest_receiver: nearest.id,
      receivers_used: usable.length,
      range_residual_rmse_m: roundTo(Math.sqrt(mean(residuals.map((r) => r * r)) ?? 0), 3),
      method: 'demo_simulated_position',
      ...base,
    }
  }

  async getConfig() {
    await delay(120)
    return { PK: 'SYSTEM', SK: 'ROOM', ...toConfigPayload(this.room), ...(this.roomUpdatedAt ? { updated_at: this.roomUpdatedAt } : {}) }
  }

  async putConfig(config: RoomConfiguration) {
    await delay(350)
    const errors = validateRoom(config).filter((i) => i.severity === 'error')
    if (errors.length) valueError(errors[0]!.field.startsWith('receivers') ? 'Receiver outside room' : 'Invalid room dimensions')
    this.room = cloneConfig(config)
    this.roomUpdatedAt = Date.now()
    this.pos = { x: clamp(this.pos.x, 0, config.width), y: clamp(this.pos.y, 0, config.length) }
    this.waypoint = { x: config.width / 2, y: config.length / 2 }
    if (this.target) this.target = { x: clamp(this.target.x, 0, config.width), y: clamp(this.target.y, 0, config.length) }
    this.emit()
    return {
      ok: true,
      configuration: { PK: 'SYSTEM', SK: 'ROOM', ...toConfigPayload(this.room), updated_at: this.roomUpdatedAt },
      warning: 'Recalibrate after moving receivers or changing their heights',
    }
  }

  async getModels() {
    await delay(100)
    const out: Json = {}
    for (const id of RECEIVER_IDS) {
      const m = this.models[id]
      out[id] = m ? { PK: 'SYSTEM', SK: `MODEL#${id}`, ...m, accepted: true } : null
    }
    return out
  }

  async getStatus() {
    await delay(90)
    if (!this.session) return { state: 'none', points: [] }
    return {
      session: { PK: 'SYSTEM', SK: 'CAL_SESSION', ...this.session },
      points: this.points.map((p) => ({
        point_id: p.pointId,
        x: p.x,
        y: p.y,
        counts: Object.fromEntries(RECEIVER_IDS.map((id) => [id, p.samples[id].length])),
      })),
    }
  }

  async startSession() {
    await delay(250)
    if (this.collecting(Date.now())) valueError('Stop active calibration point first')
    const session = hex(12)
    this.session = { session_id: session, state: 'ready', created_at: Date.now() }
    this.points = []
    this.active = null
    return { ok: true, session_id: session, state: 'ready' }
  }

  async startPoint(p: Point2D) {
    await delay(200)
    const now = Date.now()
    if (!this.session) valueError('Start calibration session first')
    if (this.collecting(now)) valueError('Stop current point first')
    if (!(p.x >= 0 && p.x <= this.room.width && p.y >= 0 && p.y <= this.room.length)) valueError('Point outside room')
    const point: DemoPoint = { pointId: hex(10), x: p.x, y: p.y, createdAt: now, samples: { 'esp32-a': [], 'esp32-b': [], 'esp32-c': [] } }
    this.points.push(point)
    this.active = { pointId: point.pointId, state: 'collecting', expiresAt: now + COLLECT_MS }
    this.session.state = 'sampling'
    // Simulate the operator physically placing the beacon at the known point.
    this.pos = { x: p.x, y: p.y }
    this.target = { x: p.x, y: p.y }
    this.wander = false
    this.emit()
    return { ok: true, point_id: point.pointId, expires_at: now + COLLECT_MS }
  }

  async stopPoint() {
    await delay(200)
    if (this.active) this.active.state = 'stopped'
    return { ok: true }
  }

  /** api_lambda.fit_model(): median RSSI per point, ≥8 samples, distance ≥ 0.25 m, ≥3 points spread in log-distance. */
  async fitModels() {
    await delay(600)
    if (this.collecting(Date.now())) valueError('Stop collection before fitting')
    if (!this.session) valueError('No session')
    if (this.points.length < 3) valueError('Collect at least three known positions')
    const output = {} as FitOutput
    for (const id of RECEIVER_IDS) {
      const anchor = this.room.receivers[id]
      const xs: number[] = []
      const ys: number[] = []
      const used: Json[] = []
      for (const p of this.points) {
        const samples = p.samples[id]
        if (samples.length < 8) continue
        const distance = distance3D({ x: p.x, y: p.y, z: this.room.asset_height }, anchor)
        if (distance < 0.25) continue
        const med = median(samples)
        xs.push(Math.log10(distance))
        ys.push(med)
        used.push({ distance: roundTo(distance, 3), count: samples.length, median_rssi: med })
      }
      if (xs.length < 3 || Math.max(...xs) - Math.min(...xs) < 0.15) {
        output[id] = { accepted: false, error: 'Not enough measurements at sufficiently different distances' }
        continue
      }
      const xb = mean(xs)!
      const yb = mean(ys)!
      const den = xs.reduce((a, x) => a + (x - xb) ** 2, 0)
      const slope = xs.reduce((a, x, i) => a + (x - xb) * (ys[i]! - yb), 0) / den
      const p0 = yb - slope * xb
      const n = -slope / 10
      const rmse = Math.sqrt(xs.reduce((a, x, i) => a + (ys[i]! - (p0 - 10 * n * x)) ** 2, 0) / xs.length)
      const valid = Number.isFinite(n) && Number.isFinite(p0) && n >= 1 && n <= 6 && p0 >= -110 && p0 <= -20
      output[id] = {
        accepted: false,
        valid,
        p0: roundTo(p0, 3),
        n: roundTo(n, 3),
        rmse_db: roundTo(rmse, 3),
        points: used,
        warning: valid ? null : 'Model outside plausible range; gather more samples',
      }
    }
    this.result = { sessionId: this.session.session_id, models: output }
    return { session_id: this.session.session_id, models: output }
  }

  async applyModels(sessionId: string) {
    await delay(400)
    if (!this.result) valueError('Fit calibration first')
    if (sessionId !== this.result.sessionId) valueError('Session mismatch')
    if (!Object.values(this.result.models).every((m) => m.valid)) valueError('Not all models passed validation')
    const now = Date.now()
    for (const id of RECEIVER_IDS) {
      const m = this.result.models[id]
      this.models[id] = { p0: m.p0 as number, n: m.n as number, rmse_db: m.rmse_db as number, session_id: this.result.sessionId, updated_at: now }
    }
    this.active = null
    return { ok: true, applied: [...RECEIVER_IDS] }
  }
}

let instance: DemoSimulator | null = null

export function getDemoSimulator(): DemoSimulator {
  if (!instance) instance = new DemoSimulator()
  instance.start()
  return instance
}

export type { DemoSimulator }

/** TrackingApi implementation backed by the demo simulator. */
export function createDemoApi(): TrackingApi {
  const sim = getDemoSimulator()
  return {
    mode: 'demo',
    getHealth: () => sim.getHealth().then(normalizeHealth),
    getAsset: () => sim.getAsset().then(normalizeAsset),
    getConfig: () => sim.getConfig().then(normalizeStoredConfig),
    putConfig: (c) => sim.putConfig(toConfigPayload(c)).then(normalizeConfigSave),
    getCalibrationModels: () => sim.getModels().then(normalizeModelSet),
    getCalibrationStatus: () => sim.getStatus().then((b) => normalizeCalibrationStatus(b)),
    startCalibration: () => sim.startSession().then(normalizeCalibrationStart),
    startCalibrationPoint: (p) => sim.startPoint(p).then(normalizePointStart),
    stopCalibrationPoint: () => sim.stopPoint().then(normalizeAction),
    fitCalibration: () => sim.fitModels().then(normalizeFit),
    applyCalibration: (id) => sim.applyModels(id).then(normalizeAction),
  }
}
