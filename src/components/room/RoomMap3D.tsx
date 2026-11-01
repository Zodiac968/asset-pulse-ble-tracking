import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { BEACON } from '@/config/constants'
import type { Point2D } from '@/types/room'
import type { ReceiverLink, ReceiverView } from '@/types/tracking'
import { gridStep, gridTicks, roomToWorld } from '@/utils/coordinates'
import type { Zone } from '@/utils/voronoi'
import type { RoomMapProps } from './types'

export type CameraPreset = 'iso' | 'top'
export interface CameraCommand {
  preset: CameraPreset
  /** Increment to re-trigger the same preset. */
  seq: number
}

interface RoomMap3DProps extends RoomMapProps {
  camera: CameraCommand
}

const LINK_COLOR: Record<ReceiverLink, string> = {
  online: '#34d399',
  no_recent: '#fbbf24',
  offline: '#f87171',
  unconfigured: '#5c6b7c',
}

/** Camera state survives switching 2D ⇄ 3D for the same room footprint. */
let savedCamera: { key: string; position: THREE.Vector3; target: THREE.Vector3 } | null = null

function presetPose(preset: CameraPreset, W: number, L: number, H: number, aspect: number) {
  const center = new THREE.Vector3(W / 2, 0, -L / 2)
  const maxSide = Math.max(W, L)
  if (preset === 'top') {
    const fit = Math.max(L, W / Math.max(aspect, 0.3)) / 2 / Math.tan(THREE.MathUtils.degToRad(22.5))
    return { position: new THREE.Vector3(W / 2, fit * 1.18 + H * 0.2, -L / 2 + 0.001), target: center }
  }
  const d = maxSide * 1.15 + H * 0.4
  return {
    position: new THREE.Vector3(W / 2 + d * 0.62, d * 0.78, -L / 2 + d * 0.92),
    target: new THREE.Vector3(W / 2, H * 0.12, -L / 2),
  }
}

function CameraRig({ W, L, H, command }: { W: number; L: number; H: number; command: CameraCommand }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera, size } = useThree()
  const key = `${W}x${L}x${H}`
  const first = useRef(true)

  const apply = (preset: CameraPreset) => {
    const pose = presetPose(preset, W, L, H, size.width / Math.max(size.height, 1))
    camera.position.copy(pose.position)
    controls.current?.target.copy(pose.target)
    controls.current?.update()
  }

  // Initial pose: restore previous camera for this room, else isometric.
  useEffect(() => {
    if (first.current && savedCamera?.key === key) {
      camera.position.copy(savedCamera.position)
      controls.current?.target.copy(savedCamera.target)
      controls.current?.update()
    } else {
      apply('iso')
    }
    first.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (command.seq > 0) apply(command.preset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command.seq])

  useEffect(
    () => () => {
      if (controls.current) savedCamera = { key, position: camera.position.clone(), target: controls.current.target.clone() }
    },
    [camera, key],
  )

  const maxSide = Math.max(W, L)
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minDistance={maxSide * 0.25}
      maxDistance={maxSide * 4}
      maxPolarAngle={Math.PI / 2 - 0.02}
    />
  )
}

function ZoneMesh({ zone, active }: { zone: Zone; active: boolean }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(zone.polygon!.map((p) => new THREE.Vector2(p.x, p.y)))
    return new THREE.ShapeGeometry(shape)
  }, [zone.polygon])
  useEffect(() => () => geometry.dispose(), [geometry])
  const outline = useMemo(
    () => [...zone.polygon!, zone.polygon![0]!].map((p) => roomToWorld(p.x, p.y, 0.012)),
    [zone.polygon],
  )
  return (
    <group>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} renderOrder={1}>
        <meshBasicMaterial color={zone.color} transparent opacity={active ? 0.3 : 0.1} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <Line points={outline} color={zone.color} lineWidth={active ? 2 : 1} transparent opacity={active ? 0.95 : 0.5} />
    </group>
  )
}

function FloorGrid({ W, L }: { W: number; L: number }) {
  const geometry = useMemo(() => {
    const step = gridStep(Math.max(W, L))
    const pts: number[] = []
    for (const x of gridTicks(W, step)) pts.push(x, 0.003, 0, x, 0.003, -L)
    for (const y of gridTicks(L, step)) pts.push(0, 0.003, -y, W, 0.003, -y)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [W, L])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#2a3a4c" transparent opacity={0.85} />
    </lineSegments>
  )
}

function RoomShell({ W, L, H }: { W: number; L: number; H: number }) {
  const floor: [number, number, number][] = [
    [0, 0, 0],
    [W, 0, 0],
    [W, 0, -L],
    [0, 0, -L],
    [0, 0, 0],
  ]
  const ceil = floor.map(([x, , z]) => [x, H, z] as [number, number, number])
  const wallMat = { color: '#7dd3fc', transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide }
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, 0, -L / 2]}>
        <planeGeometry args={[W, L]} />
        <meshStandardMaterial color="#0c141c" roughness={0.95} />
      </mesh>
      {/* Back (y = L) and left (x = 0) walls are drawn translucent; front/right stay open for viewing. */}
      <mesh position={[W / 2, H / 2, -L]}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial {...wallMat} />
      </mesh>
      <mesh position={[0, H / 2, -L / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[L, H]} />
        <meshBasicMaterial {...wallMat} />
      </mesh>
      <mesh position={[W, H / 2, -L / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[L, H]} />
        <meshBasicMaterial {...wallMat} opacity={0.015} />
      </mesh>
      <Line points={floor} color="#4b6580" lineWidth={1.5} />
      <Line points={ceil} color="#3b5068" lineWidth={1} dashed dashSize={0.15} gapSize={0.1} transparent opacity={0.7} />
      {floor.slice(0, 4).map(([x, , z], i) => (
        <Line key={i} points={[[x, 0, z], [x, H, z]]} color="#3b5068" lineWidth={1} transparent opacity={0.7} />
      ))}
    </group>
  )
}

function Axes({ size }: { size: number }) {
  const label = 'pointer-events-none select-none font-mono text-[10px] font-semibold'
  return (
    <group>
      <Line points={[[0, 0.01, 0], [size, 0.01, 0]]} color="#f87171" lineWidth={2} />
      <Line points={[[0, 0.01, 0], [0, 0.01, -size]]} color="#34d399" lineWidth={2} />
      <Line points={[[0, 0, 0], [0, size, 0]]} color="#60a5fa" lineWidth={2} />
      <Html position={[size * 1.12, 0, 0]} center className={label} style={{ color: '#f87171' }}>
        X
      </Html>
      <Html position={[0, 0, -size * 1.12]} center className={label} style={{ color: '#34d399' }}>
        Y
      </Html>
      <Html position={[0, size * 1.1, 0]} center className={label} style={{ color: '#60a5fa' }}>
        Z
      </Html>
    </group>
  )
}

function Receiver3D({ r, selected, unit, onSelect }: { r: ReceiverView; selected: boolean; unit: number; onSelect: () => void }) {
  const pos = r.position!
  const world = roomToWorld(pos.x, pos.y, pos.z)
  const online = r.link === 'online'
  return (
    <group>
      <Line points={[roomToWorld(pos.x, pos.y, 0), world]} color={r.color} lineWidth={1} transparent opacity={0.45} dashed dashSize={0.06} gapSize={0.05} />
      <mesh position={roomToWorld(pos.x, pos.y, 0.008)} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[unit * 0.9, unit * 1.15, 32]} />
        <meshBasicMaterial color={r.color} transparent opacity={0.5} />
      </mesh>
      <mesh
        position={world}
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <boxGeometry args={[unit * 1.4, unit * 0.9, unit * 1.4]} />
        <meshStandardMaterial color={r.color} emissive={r.color} emissiveIntensity={online ? 0.55 : 0.12} roughness={0.4} transparent opacity={online ? 1 : 0.55} />
      </mesh>
      {selected && (
        <mesh position={world} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[unit * 1.9, unit * 0.08, 8, 48]} />
          <meshBasicMaterial color={r.color} />
        </mesh>
      )}
      <Html position={[world[0], world[1] + unit * 1.6, world[2]]} center className="pointer-events-none select-none">
        <div className="flex items-center gap-1 rounded border border-border-strong bg-panel/90 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-foreground">
          <span className="size-1.5 rounded-full" style={{ background: LINK_COLOR[r.link] }} />
          {r.label}
        </div>
      </Html>
    </group>
  )
}

function Asset3D({ target, live, z, unit }: { target: Point2D; live: boolean; z: number; unit: number }) {
  const group = useRef<THREE.Group>(null)
  const goal = useMemo(() => new THREE.Vector3(...roomToWorld(target.x, target.y, 0)), [target.x, target.y])
  const initialized = useRef(false)

  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    if (!initialized.current || !live) {
      g.position.copy(goal)
      initialized.current = true
      return
    }
    // Ease toward the latest reported estimate only (never beyond it).
    g.position.lerp(goal, 1 - Math.exp(-dt * 6))
  })

  return (
    <group ref={group}>
      <Line points={[[0, 0.01, 0], [0, z, 0]]} color={live ? '#f472b6' : '#8b9aab'} lineWidth={1} dashed dashSize={0.05} gapSize={0.05} transparent opacity={0.7} />
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[unit * 1.2, 32]} />
        <meshBasicMaterial color={live ? '#f472b6' : '#8b9aab'} transparent opacity={0.25} depthWrite={false} />
      </mesh>
      <mesh position={[0, z, 0]}>
        <sphereGeometry args={[unit * 0.85, 24, 16]} />
        {live ? (
          <meshStandardMaterial color="#f472b6" emissive="#f472b6" emissiveIntensity={0.7} roughness={0.3} />
        ) : (
          <meshBasicMaterial color="#8b9aab" wireframe />
        )}
      </mesh>
      <Html position={[0, z + unit * 2.2, 0]} center className="pointer-events-none select-none">
        <div className="rounded border border-border-strong bg-panel/90 px-1.5 py-0.5 text-center text-[10px] whitespace-nowrap">
          <div className={live ? 'font-semibold text-asset' : 'font-semibold text-muted'}>
            {BEACON.name}
            {!live && ' · historical'}
          </div>
          <div className="text-muted">z = {z.toFixed(2)} m (assumed)</div>
        </div>
      </Html>
    </group>
  )
}

function Scene({ config, zones, receivers, asset, activeZoneId, selection, onSelect, showGrid, showZones, trail = [], circles = [], calibration, camera }: RoomMap3DProps) {
  const { width: W, length: L, height: H } = config
  const unit = Math.max(W, L) * 0.018
  const trailPts = useMemo(() => trail.map((t) => roomToWorld(t.x, t.y, 0.02)), [trail])

  return (
    <>
      <color attach="background" args={['#0a1118']} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[W, H * 3, L]} intensity={0.8} />
      <CameraRig W={W} L={L} H={H} command={camera} />

      <group onPointerMissed={() => onSelect(null)}>
        <RoomShell W={W} L={L} H={H} />
        {showGrid && <FloorGrid W={W} L={L} />}
        {showZones && zones.map((z) => z.polygon && <ZoneMesh key={z.receiverId} zone={z} active={activeZoneId === z.receiverId} />)}
        <Axes size={Math.min(1, Math.max(W, L) * 0.18)} />

        {circles.map((c) => {
          const pts = Array.from({ length: 65 }, (_, i) => {
            const a = (i / 64) * Math.PI * 2
            return roomToWorld(c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r, 0.015)
          })
          return <Line key={c.receiverId} points={pts} color={c.color} lineWidth={1} dashed dashSize={0.08} gapSize={0.08} transparent opacity={0.6} />
        })}

        {trailPts.length > 1 && <Line points={trailPts} color="#f472b6" lineWidth={1.5} transparent opacity={0.5} />}

        {calibration?.points.map((p) => (
          <mesh key={p.pointId} position={roomToWorld(p.x, p.y, unit * 0.6)}>
            <octahedronGeometry args={[unit * 0.6]} />
            <meshBasicMaterial color="#facc15" wireframe={p.pointId !== calibration.activePointId} />
          </mesh>
        ))}
        {calibration?.target && (
          <mesh position={roomToWorld(calibration.target.x, calibration.target.y, 0.012)} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[unit * 1.1, unit * 1.35, 40]} />
            <meshBasicMaterial color="#facc15" />
          </mesh>
        )}

        {receivers.map(
          (r) =>
            r.position && (
              <Receiver3D
                key={r.id}
                r={r}
                unit={unit}
                selected={selection?.kind === 'receiver' && selection.id === r.id}
                onSelect={() => onSelect({ kind: 'receiver', id: r.id })}
              />
            ),
        )}
        {asset && <Asset3D target={asset} live={asset.live} z={config.asset_height} unit={unit} />}
      </group>
    </>
  )
}

export default function RoomMap3D(props: RoomMap3DProps) {
  useEffect(() => () => void (document.body.style.cursor = ''), [])
  return (
    <div className="relative h-full w-full overflow-hidden rounded-md bg-[#0a1118]">
      <Canvas dpr={[1, 1.75]} camera={{ fov: 45, near: 0.05, far: 500 }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
        <Scene {...props} />
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded border border-border bg-panel/90 px-2 py-1 text-[11px] text-muted">
        Drag to orbit · right-drag to pan · scroll to zoom · asset Z is an assumed height, not measured
      </div>
    </div>
  )
}
