import { describe, expect, it } from 'vitest'
import { DEFAULT_ROOM, RECEIVER_OFFLINE_MS, RECEIVER_STALE_MS } from '@/config/constants'
import { normalizeAsset } from '@/services/normalize'
import { deriveLocalizationStatus, describeLocalization } from '@/utils/localization'
import { buildReceiverViews, deriveLink } from '@/utils/receivers'
import { rssiToDistance, signalQuality, distanceToRssi, fitLogDistance } from '@/utils/signal'

const NOW = 1_800_000_000_000

describe('receiver staleness', () => {
  it('derives online / no recent / offline from observation age', () => {
    expect(deriveLink(NOW - 1000, NOW)).toBe('online')
    expect(deriveLink(NOW - RECEIVER_STALE_MS - 1, NOW)).toBe('no_recent')
    expect(deriveLink(NOW - RECEIVER_OFFLINE_MS - 1, NOW)).toBe('offline')
    expect(deriveLink(null, NOW)).toBe('offline')
    expect(deriveLink(NOW, NOW, false)).toBe('unconfigured')
  })

  it('keeps esp32-c configured but offline when it never reports', () => {
    const asset = normalizeAsset({
      status: 'insufficient_data',
      receivers: {
        'esp32-a': { rssi: -60, updated_at: NOW - 500 },
        'esp32-b': { rssi: -70, updated_at: NOW - 30_000 },
      },
    })
    const views = buildReceiverViews(DEFAULT_ROOM, asset, {}, NOW)
    expect(views.map((v) => v.link)).toEqual(['online', 'no_recent', 'offline'])
    expect(views[2]!.configured).toBe(true)
  })

  it('uses session last-seen when the backend omits stale receivers', () => {
    const asset = normalizeAsset({ status: 'insufficient_data', receivers: {} })
    const views = buildReceiverViews(DEFAULT_ROOM, asset, { 'esp32-a': NOW - 3000 }, NOW)
    expect(views[0]!.link).toBe('online')
  })
})

describe('localization status rendering', () => {
  it('shows the two-receiver message for insufficient data', () => {
    const asset = normalizeAsset({ status: 'insufficient_data', x: null, y: null, receivers_used: 2 })
    const status = deriveLocalizationStatus(asset, false, NOW)
    expect(status).toBe('insufficient_data')
    const view = describeLocalization(status)
    expect(view.message).toBe('Position unavailable — three calibrated receivers required.')
    expect(view.hasLivePosition).toBe(false)
  })

  it('marks old estimates as stale (no extrapolation)', () => {
    const asset = normalizeAsset({ status: 'estimated', x: 1, y: 1, updated_at: NOW - 60_000 })
    expect(deriveLocalizationStatus(asset, false, NOW)).toBe('stale')
    expect(describeLocalization('stale').hasLivePosition).toBe(false)
  })

  it('treats a fresh estimate as live', () => {
    const asset = normalizeAsset({ status: 'estimated', x: 1, y: 1, updated_at: NOW - 1000 })
    expect(deriveLocalizationStatus(asset, false, NOW)).toBe('estimated')
    expect(describeLocalization('estimated').hasLivePosition).toBe(true)
  })

  it('reports API disconnection over any cached data', () => {
    const asset = normalizeAsset({ status: 'estimated', x: 1, y: 1, updated_at: NOW })
    expect(deriveLocalizationStatus(asset, true, NOW)).toBe('api_disconnected')
  })
})

describe('signal model', () => {
  it('treats -45 dBm as stronger than -80 dBm', () => {
    expect(signalQuality(-45)).toBe('excellent')
    expect(signalQuality(-80)).toBe('fair')
    expect(rssiToDistance(-45, -59, 2)!).toBeLessThan(rssiToDistance(-80, -59, 2)!)
  })

  it('inverts the log-distance model and recovers parameters by fitting', () => {
    expect(rssiToDistance(-59, -59, 2.2)).toBeCloseTo(1)
    const samples = [0.5, 1, 2, 3, 4.5].map((d) => ({ d, rssi: distanceToRssi(d, -60, 2.3) }))
    const fit = fitLogDistance(samples)!
    expect(fit.p0).toBeCloseTo(-60, 6)
    expect(fit.n).toBeCloseTo(2.3, 6)
  })
})
