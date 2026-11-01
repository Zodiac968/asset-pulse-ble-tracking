import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import { BEACON } from '@/config/constants'
import { useAnimatedPoint } from '@/hooks/useAnimatedPoint'
import type { Point2D, ReceiverId, ReceiverPosition } from '@/types/room'
import type { ReceiverLink } from '@/types/tracking'
import { cn } from '@/utils/cn'
import { clamp, constrainReceiver, gridStep, gridTicks, isInsideRoom, roomToSvg, roundTo, svgToRoom } from '@/utils/coordinates'
import type { RoomMapProps } from './types'

/** SVG units per metre. */
const S = 100

interface RoomMap2DProps extends RoomMapProps {
  /** Edit Mode: receivers can be dragged / nudged with arrow keys. */
  editable?: boolean
  snapStep?: number | null
  onReceiverMove?: (id: ReceiverId, pos: ReceiverPosition) => void
  /** When set, clicking inside the room picks a coordinate (e.g. calibration position). */
  onPick?: (p: Point2D) => void
  pickLabel?: string
  overlay?: ReactNode
  className?: string
}

interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

const LINK_COLOR: Record<ReceiverLink, string> = {
  online: 'var(--ok)',
  no_recent: 'var(--warn)',
  offline: 'var(--danger)',
  unconfigured: 'var(--subtle)',
}

export function RoomMap2D({
  config,
  zones,
  receivers,
  asset,
  activeZoneId,
  selection,
  onSelect,
  showGrid,
  showZones,
  trail = [],
  circles = [],
  calibration,
  editable = false,
  snapStep = null,
  onReceiverMove,
  onPick,
  pickLabel = 'Click to choose a position',
  overlay,
  className,
}: RoomMap2DProps) {
  const { width: W, length: L } = config
  const maxSide = Math.max(W, L)
  const pad = Math.max(0.55, maxSide * 0.085) * S
  const fs = clamp(maxSide * S * 0.019, 9, 400)
  const rr = fs * 1.15

  const home = useMemo<ViewBox>(() => ({ x: -pad, y: -pad * 0.7, w: W * S + pad * 1.7, h: L * S + pad * 1.7 }), [W, L, pad])
  const [vb, setVb] = useState<ViewBox>(home)
  useEffect(() => setVb(home), [home])

  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: ReceiverId; pointerId: number } | null>(null)
  const pan = useRef<{ x: number; y: number; vb: ViewBox; moved: boolean; pointerId: number } | null>(null)
  const [dragging, setDragging] = useState<ReceiverId | null>(null)
  const [cursor, setCursor] = useState<Point2D | null>(null)
  const [hover, setHover] = useState<{ kind: 'receiver'; id: ReceiverId } | { kind: 'asset' } | null>(null)
  const [hoverPx, setHoverPx] = useState<{ x: number; y: number } | null>(null)

  const P = useCallback((p: Point2D) => roomToSvg(p, L, S), [L])

  const clientToRoom = useCallback(
    (clientX: number, clientY: number): Point2D | null => {
      const svg = svgRef.current
      const ctm = svg?.getScreenCTM()
      if (!svg || !ctm) return null
      const pt = svg.createSVGPoint()
      pt.x = clientX
      pt.y = clientY
      const p = pt.matrixTransform(ctm.inverse())
      return svgToRoom(p, L, S)
    },
    [L],
  )

  /** SVG units per CSS pixel under preserveAspectRatio="meet". */
  const unitsPerPx = () => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 1
    return Math.max(vb.w / rect.width, vb.h / rect.height)
  }

  const zoom = useCallback(
    (factor: number, center?: Point2D) => {
      setVb((v) => {
        const w = clamp(v.w * factor, home.w * 0.2, home.w * 1.6)
        const k = w / v.w
        const h = v.h * k
        const cx = center?.x ?? v.x + v.w / 2
        const cy = center?.y ?? v.y + v.h / 2
        return { x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, w, h }
      })
    },
    [home.w],
  )

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms; plain wheel scrolls the page.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const p = pt.matrixTransform(ctm.inverse())
      zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, { x: p.x, y: p.y })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [zoom])

  const moveReceiver = (id: ReceiverId, p: Point2D) => {
    const current = config.receivers[id]
    onReceiverMove?.(id, constrainReceiver({ x: p.x, y: p.y, z: current.z }, config, snapStep))
  }

  const onReceiverPointerDown = (id: ReceiverId) => (e: PointerEvent<SVGGElement>) => {
    e.stopPropagation()
    onSelect({ kind: 'receiver', id })
    if (!editable || e.button !== 0) return
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    drag.current = { id, pointerId: e.pointerId }
    setDragging(id)
  }

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const room = clientToRoom(e.clientX, e.clientY)
    setCursor(room && isInsideRoom(room, W, L) ? room : null)
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) setHoverPx({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    if (drag.current && room) {
      moveReceiver(drag.current.id, room)
      return
    }
    if (pan.current) {
      const dxPx = e.clientX - pan.current.x
      const dyPx = e.clientY - pan.current.y
      if (!pan.current.moved && Math.hypot(dxPx, dyPx) < 4) return
      pan.current.moved = true
      const u = unitsPerPx()
      const start = pan.current.vb
      setVb({ ...start, x: start.x - dxPx * u, y: start.y - dyPx * u })
    }
  }

  const endPointer = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current) {
      drag.current = null
      setDragging(null)
      return
    }
    const p = pan.current
    pan.current = null
    if (p && !p.moved) {
      const room = clientToRoom(e.clientX, e.clientY)
      if (onPick && room && isInsideRoom(room, W, L)) onPick({ x: roundTo(room.x, 2), y: roundTo(room.y, 2) })
      else onSelect(null)
    }
  }

  const onBackgroundPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pan.current = { x: e.clientX, y: e.clientY, vb, moved: false, pointerId: e.pointerId }
  }

  const onReceiverKey = (id: ReceiverId) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect({ kind: 'receiver', id })
      return
    }
    if (!editable) return
    const step = (snapStep || 0.1) * (e.shiftKey ? 5 : 1)
    const d: Record<string, Point2D> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step } }
    const delta = d[e.key]
    if (!delta) return
    e.preventDefault()
    const r = config.receivers[id]
    onSelect({ kind: 'receiver', id })
    moveReceiver(id, { x: r.x + delta.x, y: r.y + delta.y })
  }

  // Grid
  const major = gridStep(maxSide)
  const minor = maxSide <= 8 ? major / 2 : null
  const xTicks = gridTicks(W, major)
  const yTicks = gridTicks(L, major)

  const animated = useAnimatedPoint(asset?.live ? { x: asset.x, y: asset.y } : null)
  const assetPoint = asset ? (asset.live ? animated : { x: asset.x, y: asset.y }) : null

  const hoveredReceiver = hover?.kind === 'receiver' ? receivers.find((r) => r.id === hover.id) : null
  const showPickCursor = Boolean(onPick)

  return (
    <div ref={containerRef} className={cn('relative h-full w-full overflow-hidden rounded-md bg-surface bg-grid-faint', className)}>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        className={cn('h-full w-full touch-none select-none', showPickCursor ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing', dragging && 'cursor-grabbing')}
        role="application"
        aria-label={`Room map, ${W} by ${L} metres. Use Tab to focus receivers${editable ? ' and arrow keys to move them' : ''}.`}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={() => {
          setCursor(null)
          setHover(null)
        }}
      >
        <defs>
          <clipPath id="room-clip">
            <rect x={0} y={0} width={W * S} height={L * S} />
          </clipPath>
          <radialGradient id="asset-glow">
            <stop offset="0%" stopColor="var(--asset)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--asset)" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Floor */}
        <rect x={0} y={0} width={W * S} height={L * S} fill="#0c141c" />

        {/* Voronoi zones */}
        {showZones && (
          <g clipPath="url(#room-clip)">
            {zones.map((z) => {
              if (!z.polygon) return null
              const active = activeZoneId === z.receiverId
              const pts = z.polygon.map((p) => P(p)).map((p) => `${p.x},${p.y}`).join(' ')
              return (
                <polygon
                  key={z.receiverId}
                  points={pts}
                  fill={z.color}
                  fillOpacity={active ? 0.2 : 0.07}
                  stroke={z.color}
                  strokeOpacity={active ? 0.9 : 0.45}
                  strokeWidth={active ? 2 : 1.25}
                  strokeDasharray={active ? undefined : '6 5'}
                  vectorEffect="non-scaling-stroke"
                  className="transition-[fill-opacity] duration-500"
                />
              )
            })}
          </g>
        )}

        {/* Grid */}
        {showGrid && (
          <g clipPath="url(#room-clip)" pointerEvents="none">
            {minor &&
              gridTicks(W, minor).map((x) => (
                <line key={`mx${x}`} x1={x * S} x2={x * S} y1={0} y2={L * S} stroke="#1b2733" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
            {minor &&
              gridTicks(L, minor).map((y) => (
                <line key={`my${y}`} y1={(L - y) * S} y2={(L - y) * S} x1={0} x2={W * S} stroke="#1b2733" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
            {xTicks.map((x) => (
              <line key={`x${x}`} x1={x * S} x2={x * S} y1={0} y2={L * S} stroke="#253445" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {yTicks.map((y) => (
              <line key={`y${y}`} y1={(L - y) * S} y2={(L - y) * S} x1={0} x2={W * S} stroke="#253445" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        )}

        {/* Zone labels */}
        {showZones &&
          zones.map((z) => {
            if (!z.centroid) return null
            // Keep the label clear of its own receiver marker and caption.
            const site = receivers.find((r) => r.id === z.receiverId)?.position
            const near = site && Math.hypot(site.x - z.centroid.x, site.y - z.centroid.y) < 0.12 * maxSide
            const anchor = near && site ? { x: site.x, y: site.y + (site.y > L / 2 ? -1 : 1) * 0.16 * maxSide } : z.centroid
            const c = P(anchor)
            const active = activeZoneId === z.receiverId
            return (
              <text
                key={`zl-${z.receiverId}`}
                x={c.x}
                y={c.y}
                textAnchor="middle"
                fontSize={fs * 0.95}
                fontWeight={600}
                fill={z.color}
                fillOpacity={active ? 0.95 : 0.4}
                letterSpacing={fs * 0.08}
                pointerEvents="none"
                style={{ textTransform: 'uppercase' }}
              >
                {z.name}
              </text>
            )
          })}

        {/* Room boundary + axes */}
        <rect x={0} y={0} width={W * S} height={L * S} fill="none" stroke="#3b5068" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <g pointerEvents="none" fontSize={fs * 0.82} fill="var(--subtle)" className="tabular" fontFamily="var(--font-mono)">
          {xTicks.map((x) => (
            <text key={`tx${x}`} x={x * S} y={L * S + fs * 1.45} textAnchor="middle">
              {roundTo(x, 2)}
            </text>
          ))}
          {yTicks.map((y) => (
            <text key={`ty${y}`} x={-fs * 0.6} y={(L - y) * S + fs * 0.3} textAnchor="end">
              {roundTo(y, 2)}
            </text>
          ))}
          <text x={(W * S) / 2} y={L * S + fs * 2.85} textAnchor="middle" fill="var(--muted)" fontFamily="var(--font-sans)">
            X — width {W} m
          </text>
          <text
            x={-fs * 2.9}
            y={(L * S) / 2}
            textAnchor="middle"
            fill="var(--muted)"
            fontFamily="var(--font-sans)"
            transform={`rotate(-90 ${-fs * 2.9} ${(L * S) / 2})`}
          >
            Y — length {L} m
          </text>
          <circle cx={0} cy={L * S} r={fs * 0.28} fill="var(--accent)" />
        </g>

        {/* Model-derived range circles (estimates) */}
        {circles.length > 0 && (
          <g clipPath="url(#room-clip)" pointerEvents="none">
            {circles.map((c) => {
              const p = P(c)
              return (
                <g key={`c-${c.receiverId}`}>
                  <circle cx={p.x} cy={p.y} r={c.r * S} fill="none" stroke={c.color} strokeOpacity={0.55} strokeWidth={1.25} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
                  <text x={p.x} y={p.y - c.r * S - fs * 0.35} textAnchor="middle" fontSize={fs * 0.72} fill={c.color} fillOpacity={0.85}>
                    ≈{c.r.toFixed(1)} m est.
                  </text>
                </g>
              )
            })}
          </g>
        )}

        {/* Trail */}
        {trail.length > 1 && (
          <g pointerEvents="none">
            {trail.slice(1).map((t, i) => {
              const a = P(trail[i]!)
              const b = P(t)
              return (
                <line
                  key={`tr-${t.t}-${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--asset)"
                  strokeOpacity={0.12 + (0.5 * (i + 1)) / trail.length}
                  strokeWidth={2}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </g>
        )}

        {/* Calibration overlay */}
        {calibration && (
          <g pointerEvents="none">
            {calibration.points.map((pt, i) => {
              const p = P(pt)
              const active = pt.pointId === calibration.activePointId
              const d = fs * 0.55
              return (
                <g key={`cp-${pt.pointId}-${i}`}>
                  {active && <circle cx={p.x} cy={p.y} r={d * 1.6} fill="var(--calibration)" className="animate-pulse-ring" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />}
                  <rect
                    x={p.x - d}
                    y={p.y - d}
                    width={d * 2}
                    height={d * 2}
                    transform={`rotate(45 ${p.x} ${p.y})`}
                    fill={active ? 'var(--calibration)' : '#3a3415'}
                    stroke="var(--calibration)"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text x={p.x + d * 1.8} y={p.y - d * 1.1} fontSize={fs * 0.72} fill="var(--calibration)" fontFamily="var(--font-mono)">
                    {pt.label}
                  </text>
                </g>
              )
            })}
            {calibration.target && (
              <g>
                {(() => {
                  const p = P(calibration.target)
                  const r = fs * 1.1
                  return (
                    <>
                      <circle cx={p.x} cy={p.y} r={r} fill="none" stroke="var(--calibration)" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                      <line x1={p.x - r * 1.6} x2={p.x + r * 1.6} y1={p.y} y2={p.y} stroke="var(--calibration)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                      <line y1={p.y - r * 1.6} y2={p.y + r * 1.6} x1={p.x} x2={p.x} stroke="var(--calibration)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                      <text x={p.x} y={p.y + r * 2.6} textAnchor="middle" fontSize={fs * 0.75} fill="var(--calibration)" fontWeight={600}>
                        Known position ({calibration.target.x.toFixed(2)}, {calibration.target.y.toFixed(2)})
                      </text>
                    </>
                  )
                })()}
              </g>
            )}
          </g>
        )}

        {/* Receivers */}
        {receivers.map((r) => {
          if (!r.position) return null
          const p = P(r.position)
          const selected = selection?.kind === 'receiver' && selection.id === r.id
          const offline = r.link !== 'online'
          return (
            <g
              key={r.id}
              transform={`translate(${p.x} ${p.y})`}
              role="button"
              tabIndex={0}
              aria-label={`${r.label} at x ${r.position.x}, y ${r.position.y} metres, ${r.link.replace('_', ' ')}`}
              aria-pressed={selected}
              className={cn('outline-none', editable ? 'cursor-move' : 'cursor-pointer')}
              onPointerDown={onReceiverPointerDown(r.id)}
              onPointerEnter={() => setHover({ kind: 'receiver', id: r.id })}
              onPointerLeave={() => setHover(null)}
              onKeyDown={onReceiverKey(r.id)}
              onFocus={() => setHover(null)}
            >
              {selected && <circle r={rr * 1.75} fill={r.color} fillOpacity={0.12} stroke={r.color} strokeOpacity={0.7} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
              {dragging === r.id && <circle r={rr * 2.3} fill="none" stroke={r.color} strokeOpacity={0.4} strokeDasharray="2 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
              <circle r={rr} fill="#0f1922" stroke={r.color} strokeWidth={2.25} strokeDasharray={offline ? '4 3' : undefined} vectorEffect="non-scaling-stroke" opacity={offline ? 0.75 : 1} />
              <text y={fs * 0.36} textAnchor="middle" fontSize={fs} fontWeight={700} fill={r.color} pointerEvents="none">
                {r.short}
              </text>
              <circle cx={rr * 0.78} cy={-rr * 0.78} r={fs * 0.27} fill={LINK_COLOR[r.link]} stroke="#0f1922" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <text y={rr + fs * 1.15} textAnchor="middle" fontSize={fs * 0.78} fill="var(--foreground)" fillOpacity={0.85} pointerEvents="none" fontWeight={500}>
                {r.label}
              </text>
              {(selected || dragging === r.id) && (
                <text y={rr + fs * 2.1} textAnchor="middle" fontSize={fs * 0.68} fill="var(--muted)" pointerEvents="none" fontFamily="var(--font-mono)">
                  ({r.position.x.toFixed(2)}, {r.position.y.toFixed(2)}, {r.position.z.toFixed(2)})
                </text>
              )}
            </g>
          )
        })}

        {/* Asset */}
        {assetPoint && asset && (
          <g
            transform={`translate(${P(assetPoint).x} ${P(assetPoint).y})`}
            role="button"
            tabIndex={0}
            aria-label={`${BEACON.name} ${asset.live ? 'estimated' : 'last known (historical)'} at x ${asset.x.toFixed(2)}, y ${asset.y.toFixed(2)} metres`}
            className="cursor-pointer outline-none"
            onPointerDown={(e) => {
              e.stopPropagation()
              onSelect({ kind: 'asset' })
            }}
            onPointerEnter={() => setHover({ kind: 'asset' })}
            onPointerLeave={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect({ kind: 'asset' })
              }
            }}
          >
            {asset.live ? (
              <>
                <circle r={rr * 2.6} fill="url(#asset-glow)" />
                <circle r={rr * 0.9} fill="var(--asset)" fillOpacity={0.35} className="animate-pulse-ring" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
                <circle r={rr * 0.62} fill="var(--asset)" stroke="#fff" strokeOpacity={0.9} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              </>
            ) : (
              <circle r={rr * 0.62} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            )}
            {selection?.kind === 'asset' && <circle r={rr * 1.5} fill="none" stroke="var(--asset)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
            <text y={-rr * 1.15} textAnchor="middle" fontSize={fs * 0.78} fontWeight={600} fill={asset.live ? 'var(--asset)' : 'var(--muted)'} pointerEvents="none">
              {asset.live ? BEACON.name : `${BEACON.name} · last known (historical)`}
            </text>
          </g>
        )}
      </svg>

      {/* Hover tooltip (details are also available by selecting/inspector panel) */}
      {hover && hoverPx && !dragging && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border-strong bg-panel-raised/95 px-2.5 py-1.5 text-[11px] shadow-lg shadow-black/40"
          style={{ left: Math.min(hoverPx.x + 14, (containerRef.current?.clientWidth ?? 400) - 190), top: hoverPx.y + 14 }}
        >
          {hoveredReceiver?.position ? (
            <>
              <div className="font-semibold" style={{ color: hoveredReceiver.color }}>
                {hoveredReceiver.label} <span className="font-mono text-muted">{hoveredReceiver.id}</span>
              </div>
              <div className="font-mono text-muted tabular">
                ({hoveredReceiver.position.x.toFixed(2)}, {hoveredReceiver.position.y.toFixed(2)}, {hoveredReceiver.position.z.toFixed(2)}) m
              </div>
              <div className="text-foreground/80">
                RSSI {hoveredReceiver.observation?.rssi ?? '—'} dBm · {hoveredReceiver.link.replace('_', ' ')}
              </div>
            </>
          ) : hover.kind === 'asset' && asset ? (
            <>
              <div className="font-semibold text-asset">{BEACON.name}</div>
              <div className="font-mono text-muted tabular">
                ({asset.x.toFixed(2)}, {asset.y.toFixed(2)}) m {asset.live ? 'estimated' : 'historical'}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Readouts & controls */}
      <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-2">
        <div className="rounded border border-border bg-panel/90 px-2 py-1 font-mono text-[11px] text-muted tabular">
          {cursor ? `x ${cursor.x.toFixed(2)}  y ${cursor.y.toFixed(2)} m` : `${W} × ${L} m`}
        </div>
        {showPickCursor && <div className="rounded border border-calibration/40 bg-calibration/10 px-2 py-1 text-[11px] text-calibration">{pickLabel}</div>}
        {editable && !showPickCursor && <div className="rounded border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] text-accent">Drag receivers · arrow keys nudge</div>}
      </div>
      <div className="absolute right-2 bottom-2 flex flex-col overflow-hidden rounded-md border border-border-strong bg-panel/90">
        <button type="button" aria-label="Zoom in" className="grid size-7 place-items-center text-muted hover:bg-panel-raised hover:text-foreground" onClick={() => zoom(1 / 1.25)}>
          <Plus className="size-3.5" />
        </button>
        <button type="button" aria-label="Zoom out" className="grid size-7 place-items-center border-y border-border text-muted hover:bg-panel-raised hover:text-foreground" onClick={() => zoom(1.25)}>
          <Minus className="size-3.5" />
        </button>
        <button type="button" aria-label="Reset view" className="grid size-7 place-items-center text-muted hover:bg-panel-raised hover:text-foreground" onClick={() => setVb(home)}>
          <Maximize className="size-3.5" />
        </button>
      </div>
      {overlay}
    </div>
  )
}

