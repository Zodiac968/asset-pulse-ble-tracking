import { describe, expect, it } from 'vitest'
import { DEFAULT_ROOM } from '@/config/constants'
import {
  cloneConfig,
  configsEqual,
  constrainReceiver,
  findDuplicateReceivers,
  roomToSvg,
  roomToWorld,
  snap,
  svgToRoom,
  validateRoom,
} from '@/utils/coordinates'
import { computeZones, nearestSite, pointInPolygon, polygonArea, zoneForPoint, type ZoneSite } from '@/utils/voronoi'

const sitesOf = (c = DEFAULT_ROOM): ZoneSite[] =>
  (['esp32-a', 'esp32-b', 'esp32-c'] as const).map((id) => ({ id, name: id, color: '#000', x: c.receivers[id].x, y: c.receivers[id].y }))

describe('coordinate transforms', () => {
  it('round-trips room <-> SVG with flipped Y', () => {
    const p = { x: 1.25, y: 3.5 }
    const s = roomToSvg(p, 4, 100)
    expect(s).toEqual({ x: 125, y: 50 })
    expect(svgToRoom(s, 4, 100)).toEqual(p)
  })

  it('maps room (x, y, z) to three.js world (x, z, -y)', () => {
    expect(roomToWorld(2, 3, 1)).toEqual([2, 1, -3])
  })

  it('snaps and clamps receivers into the room', () => {
    expect(snap(1.234, 0.1)).toBeCloseTo(1.2)
    expect(constrainReceiver({ x: -1, y: 9, z: 7 }, { width: 6, length: 4, height: 3 })).toEqual({ x: 0, y: 4, z: 3 })
    expect(constrainReceiver({ x: 2.26, y: 1.04, z: 1 }, { width: 6, length: 4, height: 3 }, 0.25)).toEqual({ x: 2.25, y: 1, z: 1 })
  })
})

describe('room validation', () => {
  it('accepts the default room', () => {
    expect(validateRoom(DEFAULT_ROOM).filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  it('rejects out-of-range dimensions and receivers outside the room', () => {
    const c = cloneConfig(DEFAULT_ROOM)
    c.width = 0.2
    c.asset_height = 5
    const errors = validateRoom(c).filter((i) => i.severity === 'error')
    expect(errors.map((e) => e.field)).toEqual(expect.arrayContaining(['width', 'asset_height', 'receivers.esp32-b', 'receivers.esp32-c']))
  })

  it('warns about receivers sharing XY', () => {
    const c = cloneConfig(DEFAULT_ROOM)
    c.receivers['esp32-b'] = { x: 0.5, y: 0.5, z: 2 }
    expect(findDuplicateReceivers(c.receivers)).toEqual([['esp32-a', 'esp32-b']])
    expect(validateRoom(c).some((i) => i.severity === 'warning')).toBe(true)
  })

  it('compares configurations structurally', () => {
    const c = cloneConfig(DEFAULT_ROOM)
    expect(configsEqual(c, DEFAULT_ROOM)).toBe(true)
    c.receivers['esp32-c'].z = 2
    expect(configsEqual(c, DEFAULT_ROOM)).toBe(false)
  })
})

describe('Voronoi zones', () => {
  it('produces one clipped cell per receiver that tiles the room', () => {
    const zones = computeZones(sitesOf(), 6, 4)
    expect(zones).toHaveLength(3)
    const total = zones.reduce((a, z) => a + z.area, 0)
    expect(total).toBeCloseTo(24, 6)
    for (const z of zones) {
      for (const p of z.polygon!) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9)
        expect(p.x).toBeLessThanOrEqual(6 + 1e-9)
        expect(p.y).toBeGreaterThanOrEqual(-1e-9)
        expect(p.y).toBeLessThanOrEqual(4 + 1e-9)
      }
    }
  })

  it('assigns every point to the polygon of its nearest receiver', () => {
    const sites = sitesOf()
    const zones = computeZones(sites, 6, 4)
    for (let i = 0; i < 200; i++) {
      const p = { x: Math.random() * 6, y: Math.random() * 4 }
      const owner = nearestSite(p, sites)!
      const zone = zones.find((z) => z.receiverId === owner.id)!
      expect(pointInPolygon(p, zone.polygon!)).toBe(true)
      expect(zoneForPoint(p, sites, zones)?.receiverId).toBe(owner.id)
    }
  })

  it('splits the default room symmetrically between A and B', () => {
    const zones = computeZones(sitesOf(), 6, 4)
    const a = zones.find((z) => z.receiverId === 'esp32-a')!
    const b = zones.find((z) => z.receiverId === 'esp32-b')!
    expect(a.area).toBeCloseTo(b.area, 6)
  })

  it('recomputes when receivers move', () => {
    const c = cloneConfig(DEFAULT_ROOM)
    c.receivers['esp32-a'] = { x: 2.5, y: 2, z: 1 }
    const moved = computeZones(sitesOf(c), 6, 4).find((z) => z.receiverId === 'esp32-a')!
    const before = computeZones(sitesOf(), 6, 4).find((z) => z.receiverId === 'esp32-a')!
    expect(moved.area).not.toBeCloseTo(before.area, 2)
  })

  it('flags coincident receivers as ambiguous instead of crashing', () => {
    const sites = sitesOf()
    sites[1] = { ...sites[1]!, x: sites[0]!.x, y: sites[0]!.y }
    const zones = computeZones(sites, 6, 4)
    expect(zones[0]!.polygon).not.toBeNull()
    expect(zones[1]!.ambiguous).toBe(true)
    expect(zones[1]!.polygon).toBeNull()
    expect(zones[0]!.area + zones[2]!.area).toBeCloseTo(24, 6)
  })

  it('handles collinear receivers', () => {
    const sites: ZoneSite[] = [0, 1, 2].map((i) => ({ id: `r${i}`, name: '', color: '', x: 1 + i * 2, y: 2 }))
    const zones = computeZones(sites, 6, 4)
    expect(zones.every((z) => z.polygon && Math.abs(polygonArea(z.polygon)) > 0)).toBe(true)
  })
})
