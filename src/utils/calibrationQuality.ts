import { CALIBRATION, RECEIVER_META } from '@/config/constants'
import type { CalibrationModel, CalibrationPoint } from '@/types/calibration'
import { RECEIVER_IDS, type RoomConfiguration } from '@/types/room'

export interface QualityWarning {
  receiverId: string | null
  severity: 'warn' | 'danger'
  message: string
}

/** UI-side advisory checks. The backend's own validation result is authoritative. */
export function modelWarnings(models: Record<string, CalibrationModel | undefined>, points: CalibrationPoint[]): QualityWarning[] {
  const out: QualityWarning[] = []
  for (const id of RECEIVER_IDS) {
    const label = RECEIVER_META[id].label
    const m = models[id]
    const totalSamples = points.reduce((a, p) => a + (p.counts[id] ?? 0), 0)
    if (!m) {
      out.push({ receiverId: id, severity: 'danger', message: `${label}: no model returned (missing receiver).` })
      continue
    }
    if (m.valid === false) out.push({ receiverId: id, severity: 'danger', message: `${label}: rejected by backend validation${m.reason ? ` — ${m.reason.replace(/\.$/, '')}` : ''}.` })
    if (totalSamples === 0) out.push({ receiverId: id, severity: 'danger', message: `${label}: no samples received.` })
    else if (m.measurements && m.measurements.length < points.length)
      out.push({ receiverId: id, severity: 'warn', message: `${label}: fit used ${m.measurements.length} of ${points.length} positions.` })
    if (m.n !== null && (m.n < CALIBRATION.nRange[0] || m.n > CALIBRATION.nRange[1]))
      out.push({ receiverId: id, severity: 'warn', message: `${label}: unusual path-loss exponent n = ${m.n.toFixed(2)} (typical ${CALIBRATION.nRange[0]}–${CALIBRATION.nRange[1]}).` })
    if (m.p0 !== null && (m.p0 < CALIBRATION.p0Range[0] || m.p0 > CALIBRATION.p0Range[1]))
      out.push({ receiverId: id, severity: 'warn', message: `${label}: unusual reference RSSI P0 = ${m.p0.toFixed(1)} dBm.` })
    if (m.rmseDb !== null && m.rmseDb > CALIBRATION.maxGoodRmseDb)
      out.push({ receiverId: id, severity: 'warn', message: `${label}: poor model fit (RSSI RMSE ${m.rmseDb.toFixed(1)} dB).` })
    const highVar = points.filter((p) => (p.stdRssi?.[id] ?? 0) > CALIBRATION.maxStdDb)
    if (highVar.length)
      out.push({ receiverId: id, severity: 'warn', message: `${label}: high RSSI variance at ${highVar.map((p) => p.label).join(', ')}.` })
  }
  return out
}

export function pointCoverageWarnings(points: CalibrationPoint[], room: RoomConfiguration): QualityWarning[] {
  const out: QualityWarning[] = []
  if (points.length < CALIBRATION.recommendedPoints)
    out.push({ receiverId: null, severity: 'warn', message: `${points.length} of ${CALIBRATION.recommendedPoints} recommended calibration positions collected.` })
  if (points.length >= 2) {
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const spanX = Math.max(...xs) - Math.min(...xs)
    const spanY = Math.max(...ys) - Math.min(...ys)
    if (spanX < room.width * 0.4 || spanY < room.length * 0.4)
      out.push({ receiverId: null, severity: 'warn', message: 'Calibration positions are clustered; spread them across the room for a better fit.' })
  }
  if (points.length > 0 && points.length < CALIBRATION.minFitPoints)
    out.push({ receiverId: null, severity: 'warn', message: `The backend needs at least ${CALIBRATION.minFitPoints} positions to fit.` })
  for (const id of RECEIVER_IDS) {
    const label = RECEIVER_META[id].label
    if (points.length > 0 && points.every((p) => (p.counts[id] ?? 0) === 0)) {
      out.push({ receiverId: id, severity: 'danger', message: `${label}: no samples at any position (missing receiver).` })
      continue
    }
    // The backend fit ignores a position with fewer than 8 samples for that receiver.
    const sparse = points.filter((p) => (p.counts[id] ?? 0) < CALIBRATION.backendMinSamplesPerPoint)
    if (sparse.length)
      out.push({
        receiverId: id,
        severity: 'warn',
        message: `${label}: fewer than ${CALIBRATION.backendMinSamplesPerPoint} samples at ${sparse.map((p) => p.label).join(', ')} — the fit skips ${sparse.length === 1 ? 'that position' : 'those positions'}.`,
      })
  }
  return out
}
