import { RECEIVER_META, ROOM_LIMITS } from '@/config/constants'
import { RECEIVER_IDS, type Point2D, type ReceiverId, type ReceiverPosition, type RoomConfiguration, type ValidationIssue } from '@/types/room'

export const DUPLICATE_XY_EPSILON = 0.01

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function roundTo(value: number, decimals = 2): number {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

export function snap(value: number, step: number): number {
  if (step <= 0) return value
  return roundTo(Math.round(value / step) * step, 4)
}

export function distance2D(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function distance3D(a: ReceiverPosition, b: ReceiverPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

export function isInsideRoom(p: Point2D, width: number, length: number, eps = 1e-9): boolean {
  return p.x >= -eps && p.y >= -eps && p.x <= width + eps && p.y <= length + eps
}

/** Clamp a receiver position into the room volume and optionally snap X/Y. */
export function constrainReceiver(
  pos: ReceiverPosition,
  room: Pick<RoomConfiguration, 'width' | 'length' | 'height'>,
  snapStep: number | null = null,
): ReceiverPosition {
  let x = clamp(pos.x, 0, room.width)
  let y = clamp(pos.y, 0, room.length)
  if (snapStep) {
    x = clamp(snap(x, snapStep), 0, room.width)
    y = clamp(snap(y, snapStep), 0, room.length)
  }
  return { x: roundTo(x, 3), y: roundTo(y, 3), z: roundTo(clamp(pos.z, 0, room.height), 3) }
}

/**
 * Coordinates used by the SVG map: room Y points up on screen, so SVG y is
 * flipped. Scale = SVG units per metre.
 */
export function roomToSvg(p: Point2D, length: number, scale: number): Point2D {
  return { x: p.x * scale, y: (length - p.y) * scale }
}

export function svgToRoom(p: Point2D, length: number, scale: number): Point2D {
  return { x: p.x / scale, y: length - p.y / scale }
}

/** Room (x, y, z; z up) to three.js world (x, y up, z): (x, z, -y). */
export function roomToWorld(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y]
}

/** Pick sensible major grid spacing for a room of the given size. */
export function gridStep(maxSide: number): number {
  if (maxSide <= 12) return 1
  if (maxSide <= 30) return 2
  if (maxSide <= 60) return 5
  return 10
}

export function gridTicks(extent: number, step: number): number[] {
  const ticks: number[] = []
  for (let v = 0; v <= extent + 1e-9; v += step) ticks.push(roundTo(v, 4))
  if (ticks[ticks.length - 1] !== extent && extent - (ticks[ticks.length - 1] ?? 0) > step * 0.35) ticks.push(extent)
  return ticks
}

export function findDuplicateReceivers(
  receivers: Record<ReceiverId, ReceiverPosition>,
  eps = DUPLICATE_XY_EPSILON,
): ReceiverId[][] {
  const groups: ReceiverId[][] = []
  const seen = new Set<ReceiverId>()
  for (const a of RECEIVER_IDS) {
    if (seen.has(a)) continue
    const group: ReceiverId[] = [a]
    for (const b of RECEIVER_IDS) {
      if (a === b || seen.has(b)) continue
      if (distance2D(receivers[a], receivers[b]) < eps) group.push(b)
    }
    if (group.length > 1) {
      group.forEach((id) => seen.add(id))
      groups.push(group)
    }
  }
  return groups
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export function validateRoom(config: RoomConfiguration): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const side = (field: 'width' | 'length', label: string) => {
    const v = config[field]
    if (!isNum(v)) issues.push({ field, message: `${label} must be a number.`, severity: 'error' })
    else if (v < ROOM_LIMITS.minSide || v > ROOM_LIMITS.maxSide)
      issues.push({ field, message: `${label} must be between ${ROOM_LIMITS.minSide} and ${ROOM_LIMITS.maxSide} m.`, severity: 'error' })
  }
  side('width', 'Width')
  side('length', 'Length')
  if (!isNum(config.height)) issues.push({ field: 'height', message: 'Height must be a number.', severity: 'error' })
  else if (config.height < ROOM_LIMITS.minHeight || config.height > ROOM_LIMITS.maxHeight)
    issues.push({
      field: 'height',
      message: `Height must be between ${ROOM_LIMITS.minHeight} and ${ROOM_LIMITS.maxHeight} m.`,
      severity: 'error',
    })
  if (!isNum(config.asset_height)) issues.push({ field: 'asset_height', message: 'Asset height must be a number.', severity: 'error' })
  else if (config.asset_height < 0 || (isNum(config.height) && config.asset_height > config.height))
    issues.push({ field: 'asset_height', message: 'Asset height must be between 0 and the room height.', severity: 'error' })

  for (const id of RECEIVER_IDS) {
    const r = config.receivers[id]
    const label = RECEIVER_META[id].label
    if (!r || !isNum(r.x) || !isNum(r.y) || !isNum(r.z)) {
      issues.push({ field: `receivers.${id}`, message: `${label} needs numeric X, Y and Z.`, severity: 'error' })
      continue
    }
    if (isNum(config.width) && isNum(config.length) && !isInsideRoom(r, config.width, config.length))
      issues.push({ field: `receivers.${id}`, message: `${label} lies outside the room footprint.`, severity: 'error' })
    if (isNum(config.height) && (r.z < 0 || r.z > config.height))
      issues.push({ field: `receivers.${id}.z`, message: `${label} Z must be between 0 and the room height.`, severity: 'error' })
  }

  const allValid = RECEIVER_IDS.every((id) => {
    const r = config.receivers[id]
    return r && isNum(r.x) && isNum(r.y)
  })
  if (allValid) {
    for (const group of findDuplicateReceivers(config.receivers)) {
      issues.push({
        field: 'receivers',
        message: `${group.map((id) => RECEIVER_META[id].label).join(' and ')} share the same X/Y position — their Voronoi zones are ambiguous.`,
        severity: 'warning',
      })
    }
  }
  return issues
}

export function configsEqual(a: RoomConfiguration | null, b: RoomConfiguration | null): boolean {
  if (!a || !b) return a === b
  if (a.width !== b.width || a.length !== b.length || a.height !== b.height || a.asset_height !== b.asset_height) return false
  return RECEIVER_IDS.every((id) => {
    const p = a.receivers[id]
    const q = b.receivers[id]
    return p.x === q.x && p.y === q.y && p.z === q.z
  })
}

export function cloneConfig(c: RoomConfiguration): RoomConfiguration {
  return {
    width: c.width,
    length: c.length,
    height: c.height,
    asset_height: c.asset_height,
    receivers: {
      'esp32-a': { ...c.receivers['esp32-a'] },
      'esp32-b': { ...c.receivers['esp32-b'] },
      'esp32-c': { ...c.receivers['esp32-c'] },
    },
  }
}

/** True if any receiver XYZ differs between configurations (physical layout change). */
export function receiversMoved(a: RoomConfiguration, b: RoomConfiguration): boolean {
  return RECEIVER_IDS.some((id) => {
    const p = a.receivers[id]
    const q = b.receivers[id]
    return p.x !== q.x || p.y !== q.y || p.z !== q.z
  })
}
