/** Log-distance path-loss model: d = 10^((P0 - RSSI) / (10 n)). */
export function rssiToDistance(rssi: number, p0: number, n: number): number | null {
  if (!Number.isFinite(rssi) || !Number.isFinite(p0) || !Number.isFinite(n) || n <= 0) return null
  return Math.pow(10, (p0 - rssi) / (10 * n))
}

/** Inverse model: RSSI at distance d. */
export function distanceToRssi(d: number, p0: number, n: number): number {
  return p0 - 10 * n * Math.log10(Math.max(d, 1e-3))
}

export type SignalQuality = 'excellent' | 'good' | 'fair' | 'weak' | 'none'

/** RSSI is negative; values closer to 0 are stronger (-45 dBm > -80 dBm). */
export function signalQuality(rssi: number | null): SignalQuality {
  if (rssi === null || !Number.isFinite(rssi)) return 'none'
  if (rssi >= -55) return 'excellent'
  if (rssi >= -67) return 'good'
  if (rssi >= -80) return 'fair'
  return 'weak'
}

/** Map RSSI onto 0..1 for meter bars, -100 dBm => 0, -30 dBm => 1. */
export function rssiToUnit(rssi: number | null, floor = -100, ceil = -30): number {
  if (rssi === null || !Number.isFinite(rssi)) return 0
  return Math.min(1, Math.max(0, (rssi - floor) / (ceil - floor)))
}

export function formatDbm(rssi: number | null, digits = 0): string {
  if (rssi === null || !Number.isFinite(rssi)) return '—'
  return `${rssi.toFixed(digits)} dBm`
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function stdDev(values: number[]): number | null {
  const m = mean(values)
  if (m === null || values.length < 2) return null
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1))
}

/**
 * Least-squares fit of RSSI = P0 - 10 n log10(d). Used only by the demo
 * simulator to fit its own simulated samples; the live backend fits its own.
 */
export function fitLogDistance(samples: { d: number; rssi: number }[]): { p0: number; n: number; rmse: number } | null {
  const pts = samples.filter((s) => s.d > 0.05 && Number.isFinite(s.rssi))
  if (pts.length < 3) return null
  const xs = pts.map((p) => -10 * Math.log10(p.d))
  const ys = pts.map((p) => p.rssi)
  const mx = mean(xs)!
  const my = mean(ys)!
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < xs.length; i++) {
    sxx += (xs[i]! - mx) ** 2
    sxy += (xs[i]! - mx) * (ys[i]! - my)
  }
  if (sxx < 1e-9) return null
  const n = sxy / sxx
  const p0 = my - n * mx
  const rmse = Math.sqrt(pts.reduce((acc, p, i) => acc + (p.rssi - (p0 + n * xs[i]!)) ** 2, 0) / pts.length)
  return { p0, n, rmse }
}
