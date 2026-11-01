import { describe, expect, it } from 'vitest'
import {
  extractErrorMessage,
  normalizeAsset,
  normalizeCalibrationStatus,
  normalizeConfigSave,
  normalizeFit,
  normalizeModelSet,
  normalizePointStart,
  normalizeStoredConfig,
  toConfigPayload,
} from '@/services/normalize'
import { DEFAULT_ROOM } from '@/config/constants'

describe('GET /asset normalization', () => {
  it('parses an estimated result', () => {
    const a = normalizeAsset({
      status: 'estimated',
      x: 2.35,
      y: 1.72,
      current_zone: 'Zone A',
      nearest_receiver: 'esp32-a',
      receivers_used: 3,
      range_residual_rmse_m: 0.42,
      method: 'bounded_range_least_squares',
      updated_at: 1793260000000,
      beacon_id: 'B4:A7:24:16:BA:8A',
      receivers: { 'esp32-a': { receiver_id: 'esp32-a', rssi: -65, filtered_rssi: -66.2, packets: 3, updated_at: 1793260000000 } },
    })
    expect(a.status).toBe('estimated')
    expect(a.x).toBe(2.35)
    expect(a.currentZone).toBe('Zone A')
    expect(a.rangeResidualRmseM).toBe(0.42)
    expect(a.receivers['esp32-a']).toMatchObject({ rssi: -65, filteredRssi: -66.2, packets: 3, updatedAt: 1793260000000 })
  })

  it('parses insufficient_data with null coordinates and no zone', () => {
    const a = normalizeAsset({ status: 'insufficient_data', x: null, y: null, current_zone: 'Unknown', receivers_used: 2 })
    expect(a.status).toBe('insufficient_data')
    expect(a.x).toBeNull()
    expect(a.currentZone).toBeNull()
    expect(a.receiversUsed).toBe(2)
    expect(a.receivers).toEqual({})
  })

  it('never exposes coordinates for non-estimated results', () => {
    const a = normalizeAsset({ status: 'insufficient_data', x: 1, y: 1 })
    expect(a.x).toBeNull()
    expect(a.y).toBeNull()
  })

  it('normalizes seconds timestamps to ms and tolerates missing fields', () => {
    const a = normalizeAsset({ status: 'estimated', x: '1.5', y: 2, updated_at: 1793260000 })
    expect(a.updatedAt).toBe(1793260000000)
    expect(a.x).toBe(1.5)
    expect(a.method).toBeNull()
    expect(normalizeAsset(null).status).toBe('unknown')
  })
})

describe('config normalization', () => {
  it('strips DynamoDB metadata', () => {
    const s = normalizeStoredConfig({ PK: 'SYSTEM', SK: 'ROOM', updated_at: 1793260000000, ...DEFAULT_ROOM })
    expect(s.configuration).toEqual(DEFAULT_ROOM)
    expect(Object.keys(s.configuration)).not.toContain('PK')
    expect(s.updatedAt).toBe(1793260000000)
  })

  it('builds the exact PUT payload with all three receivers', () => {
    const payload = toConfigPayload({ ...DEFAULT_ROOM, ...({ PK: 'x' } as object) } as typeof DEFAULT_ROOM)
    expect(Object.keys(payload).sort()).toEqual(['asset_height', 'height', 'length', 'receivers', 'width'])
    expect(Object.keys(payload.receivers).sort()).toEqual(['esp32-a', 'esp32-b', 'esp32-c'])
  })

  it('surfaces the save warning', () => {
    const r = normalizeConfigSave({ ok: true, configuration: DEFAULT_ROOM, warning: 'Recalibrate' })
    expect(r).toMatchObject({ ok: true, warning: 'Recalibrate' })
  })

  it('rejects an incomplete config', () => {
    expect(() => normalizeStoredConfig({ width: 6 })).toThrow()
  })
})

// Fixtures below follow api_lambda.py exactly.
describe('calibration normalization (api_lambda.py shapes)', () => {
  it('handles the no-session variant', () => {
    const s = normalizeCalibrationStatus({ state: 'none', points: [] })
    expect(s.session).toBeNull()
    expect(s.state).toBe('none')
    expect(s.points).toEqual([])
  })

  it('does not treat session.state "sampling" as an active point', () => {
    const s = normalizeCalibrationStatus({
      session: { PK: 'SYSTEM', SK: 'CAL_SESSION', session_id: 'a1b2c3d4e5f6', state: 'sampling', created_at: 1793260000000 },
      points: [
        { point_id: '0f1e2d3c4b', x: 1, y: 1, counts: { 'esp32-a': 30, 'esp32-b': 28, 'esp32-c': 0 } },
        { point_id: '9a8b7c6d5e', x: 5, y: 1, counts: { 'esp32-a': 12, 'esp32-b': 31, 'esp32-c': 0 } },
      ],
    })
    expect(s.session).toMatchObject({ sessionId: 'a1b2c3d4e5f6', status: 'sampling', createdAt: 1793260000000 })
    expect(s.points.map((p) => p.label)).toEqual(['P1', 'P2'])
    expect(s.points[0]).toMatchObject({ pointId: '0f1e2d3c4b', counts: { 'esp32-a': 30, 'esp32-b': 28, 'esp32-c': 0 } })
    expect(s.points.every((p) => p.active === null)).toBe(true)
  })

  it('uses a CAL_ACTIVE record if the status response ever includes one', () => {
    const now = 1793260000000
    const s = normalizeCalibrationStatus(
      {
        session: { session_id: 'S', state: 'sampling' },
        active: { point_id: 'b', state: 'collecting', expires_at: now + 5000 },
        points: [
          { point_id: 'a', x: 1, y: 1, counts: {} },
          { point_id: 'b', x: 2, y: 2, counts: {} },
        ],
      },
      now,
    )
    expect(s.points.map((p) => p.active)).toEqual([false, true])
  })

  it('reads point_id and expires_at from POST /calibration/point', () => {
    expect(normalizePointStart({ ok: true, point_id: '9a8b7c6d5e', expires_at: 1793260120000 })).toMatchObject({
      pointId: '9a8b7c6d5e',
      expiresAt: 1793260120000,
    })
  })

  it('parses fit output: error models are invalid and accepted:false is not "invalid"', () => {
    const fit = normalizeFit({
      session_id: 'a1b2c3d4e5f6',
      models: {
        'esp32-a': {
          accepted: false,
          valid: true,
          p0: -58.9,
          n: 2.31,
          rmse_db: 1.42,
          points: [
            { distance: 0.71, count: 30, median_rssi: -55 },
            { distance: 5.0, count: 12, median_rssi: -75 },
            { distance: 2.9, count: 22, median_rssi: -69 },
          ],
          warning: null,
        },
        'esp32-b': { accepted: false, valid: false, p0: -15, n: 0.4, rmse_db: 6.1, points: [], warning: 'Model outside plausible range; gather more samples' },
        'esp32-c': { accepted: false, error: 'Not enough measurements at sufficiently different distances' },
      },
    })
    expect(fit.sessionId).toBe('a1b2c3d4e5f6')
    expect(fit.models['esp32-a']).toMatchObject({ valid: true, accepted: false, p0: -58.9, n: 2.31, rmseDb: 1.42, samples: 64 })
    expect(fit.models['esp32-a']!.measurements).toHaveLength(3)
    expect(fit.models['esp32-b']).toMatchObject({ valid: false, reason: 'Model outside plausible range; gather more samples' })
    expect(fit.models['esp32-c']).toMatchObject({ valid: false, p0: null, reason: 'Not enough measurements at sufficiently different distances' })
    expect(fit.allValid).toBe(false)
  })

  it('reports allValid only when all three receivers pass', () => {
    const ok = { accepted: false, valid: true, p0: -59, n: 2.2, rmse_db: 1, points: [] }
    expect(normalizeFit({ models: { 'esp32-a': ok, 'esp32-b': ok } }).allValid).toBe(false)
    expect(normalizeFit({ models: { 'esp32-a': ok, 'esp32-b': ok, 'esp32-c': ok } }).allValid).toBe(true)
  })

  it('parses GET /calibration/models with null entries and per-model timestamps', () => {
    const set = normalizeModelSet({
      'esp32-a': { PK: 'SYSTEM', SK: 'MODEL#esp32-a', p0: -58.6, n: 2.31, rmse_db: 1.2, accepted: true, session_id: 'S1', updated_at: 1793260000000 },
      'esp32-b': { PK: 'SYSTEM', SK: 'MODEL#esp32-b', p0: -61.4, n: 2.36, rmse_db: 1.4, accepted: true, session_id: 'S1', updated_at: 1793260005000 },
      'esp32-c': null,
    })
    expect(Object.keys(set.models)).toEqual(['esp32-a', 'esp32-b'])
    expect(set.models['esp32-a']).toMatchObject({ accepted: true, valid: true, p0: -58.6 })
    expect(set.appliedAt).toBe(1793260005000)
    expect(set.sessionId).toBe('S1')
  })

  it('extracts API error messages', () => {
    expect(extractErrorMessage({ error: 'Stop current point first' })).toBe('Stop current point first')
    expect(extractErrorMessage({ message: 'Unauthorized' })).toBe('Unauthorized')
    expect(extractErrorMessage(null)).toBeNull()
  })
})
