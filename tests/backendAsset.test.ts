import { describe, expect, it } from 'vitest'
import { DEFAULT_ROOM } from '@/config/constants'
import { normalizeAsset } from '@/services/normalize'
import { deriveLocalizationStatus, describeLocalization } from '@/utils/localization'
import { buildReceiverViews } from '@/utils/receivers'

const NOW = 1_800_000_000_000
// RX# items as returned inside localization_lambda.compute()['receivers'].
const rx = (id: string, rssi: number, age: number) => ({ PK: 'ASSET#01', SK: `RX#${id}`, receiver_id: id, rssi, filtered_rssi: rssi - 0.5, updated_at: NOW - age })

describe('GET /asset from localization_lambda.compute()', () => {
  it('two physical receivers: insufficient data, both online, C offline', () => {
    const body = {
      status: 'insufficient_data',
      x: null,
      y: null,
      current_zone: 'Unknown',
      receivers_used: 2,
      updated_at: NOW,
      beacon_id: 'B4:A7:24:16:BA:8A',
      asset_id: 'ASSET#01',
      receivers: { 'esp32-a': rx('esp32-a', -62, 1500), 'esp32-b': rx('esp32-b', -71, 3000) },
    }
    const asset = normalizeAsset(body)
    expect(deriveLocalizationStatus(asset, false, NOW)).toBe('insufficient_data')
    expect(describeLocalization('insufficient_data').message).toBe('Position unavailable — three calibrated receivers required.')
    const views = buildReceiverViews(DEFAULT_ROOM, asset, {}, NOW)
    expect(views.map((v) => v.link)).toEqual(['online', 'online', 'offline'])
    expect(views[0]!.observation).toMatchObject({ rssi: -62, filteredRssi: -62.5 })
  })

  it('three fresh receivers without activated models: calibration required', () => {
    const asset = normalizeAsset({
      status: 'insufficient_data',
      x: null,
      y: null,
      current_zone: 'Unknown',
      receivers_used: 0,
      updated_at: NOW,
      receivers: { 'esp32-a': rx('esp32-a', -62, 500), 'esp32-b': rx('esp32-b', -70, 500), 'esp32-c': rx('esp32-c', -66, 500) },
    })
    expect(deriveLocalizationStatus(asset, false, NOW)).toBe('calibration_required')
  })

  it('estimated result is shown live', () => {
    const asset = normalizeAsset({
      status: 'estimated',
      x: 2.35,
      y: 1.72,
      current_zone: 'Zone A',
      nearest_receiver: 'esp32-a',
      receivers_used: 3,
      range_residual_rmse_m: 0.42,
      method: 'bounded_range_least_squares',
      updated_at: NOW,
      receivers: { 'esp32-a': rx('esp32-a', -62, 500), 'esp32-b': rx('esp32-b', -70, 500), 'esp32-c': rx('esp32-c', -66, 500) },
    })
    expect(deriveLocalizationStatus(asset, false, NOW)).toBe('estimated')
    expect(asset).toMatchObject({ x: 2.35, y: 1.72, nearestReceiver: 'esp32-a', method: 'bounded_range_least_squares' })
  })
})
