import { Delaunay } from 'd3-delaunay'
import { DUPLICATE_XY_EPSILON, distance2D } from './coordinates'
import type { Point2D } from '@/types/room'

export interface ZoneSite {
  id: string
  name: string
  color: string
  x: number
  y: number
}

export interface Zone {
  receiverId: string
  name: string
  color: string
  /** Polygon (room metres, counter-clockwise) clipped to the room, or null if ambiguous/degenerate. */
  polygon: Point2D[] | null
  centroid: Point2D | null
  area: number
  /** True when this site shares XY with another site and has no unique region. */
  ambiguous: boolean
  /** IDs of other receivers sharing this site's XY position. */
  sharedWith: string[]
}

export function polygonArea(poly: Point2D[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!
    const q = poly[(i + 1) % poly.length]!
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

export function polygonCentroid(poly: Point2D[]): Point2D | null {
  const a = polygonArea(poly)
  if (Math.abs(a) < 1e-12) return null
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!
    const q = poly[(i + 1) % poly.length]!
    const f = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

export function pointInPolygon(p: Point2D, poly: Point2D[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * Voronoi diagram of the receiver sites in the horizontal XY plane, clipped
 * to the rectangular room [0,width] x [0,length]. Sites sharing XY are merged:
 * the first keeps the region, the others are flagged ambiguous.
 */
export function computeZones(sites: ZoneSite[], width: number, length: number): Zone[] {
  if (!(width > 0) || !(length > 0) || sites.length === 0) return []

  const unique: ZoneSite[] = []
  const owner = new Map<string, ZoneSite>()
  for (const s of sites) {
    const match = unique.find((u) => distance2D(u, s) < DUPLICATE_XY_EPSILON)
    if (match) owner.set(s.id, match)
    else {
      unique.push(s)
      owner.set(s.id, s)
    }
  }

  const polygons = new Map<string, Point2D[] | null>()
  if (unique.length === 1) {
    polygons.set(unique[0]!.id, [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: length },
      { x: 0, y: length },
    ])
  } else {
    const delaunay = Delaunay.from(unique, (s) => s.x, (s) => s.y)
    const voronoi = delaunay.voronoi([0, 0, width, length])
    unique.forEach((s, i) => {
      const cell = voronoi.cellPolygon(i)
      if (!cell) {
        polygons.set(s.id, null)
        return
      }
      // d3 closes the ring by repeating the first vertex.
      const ring = cell.slice(0, -1).map(([x, y]) => ({ x: x!, y: y! }))
      polygons.set(s.id, ring.length >= 3 ? ring : null)
    })
  }

  return sites.map((s) => {
    const own = owner.get(s.id)!
    const ambiguous = own.id !== s.id
    const sharedWith = sites.filter((o) => o.id !== s.id && owner.get(o.id)!.id === own.id).map((o) => o.id)
    const polygon = ambiguous ? null : (polygons.get(s.id) ?? null)
    return {
      receiverId: s.id,
      name: s.name,
      color: s.color,
      polygon,
      centroid: polygon ? polygonCentroid(polygon) : null,
      area: polygon ? Math.abs(polygonArea(polygon)) : 0,
      ambiguous,
      sharedWith,
    }
  })
}

/** Geometric nearest site in XY. Ties resolve to the first site in order. */
export function nearestSite<T extends Point2D>(p: Point2D, sites: T[]): T | null {
  let best: T | null = null
  let bestD = Infinity
  for (const s of sites) {
    const d = distance2D(p, s)
    if (d < bestD - 1e-12) {
      best = s
      bestD = d
    }
  }
  return best
}

/** Zone that geometrically contains a point (via nearest-site rule, consistent with the polygons). */
export function zoneForPoint(p: Point2D, sites: ZoneSite[], zones: Zone[]): Zone | null {
  const site = nearestSite(p, sites)
  if (!site) return null
  const z = zones.find((zone) => zone.receiverId === site.id)
  if (z && z.ambiguous) {
    return zones.find((zone) => zone.sharedWith.includes(site.id) && !zone.ambiguous) ?? z
  }
  return z ?? null
}
