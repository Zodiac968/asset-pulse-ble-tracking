import { Suspense, lazy, useState, type ReactNode } from 'react'
import { Box, Circle, Crosshair, Grid3x3, Hexagon, Layers, Route, Square, View } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMapData } from '@/hooks/useMapData'
import { useRoomDraftStore } from '@/stores/roomDraftStore'
import { useUiStore } from '@/stores/uiStore'
import { useSession } from '@/components/auth/SessionProvider'
import { cn } from '@/utils/cn'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Callout, Segmented } from '../ui/misc'
import { Tooltip } from '../ui/overlay'
import { SelectionCard } from '../tracking/SelectionCard'
import { RoomMap2D } from './RoomMap2D'
import { EditModeToggle, SaveBar } from './RoomControls'
import type { CameraCommand } from './RoomMap3D'

const RoomMap3D = lazy(() => import('./RoomMap3D'))

function LayerToggle({ active, onClick, icon, label, hint }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; hint?: string }) {
  return (
    <Tooltip content={hint ?? label}>
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors [&_svg]:size-3.5',
          active ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border-strong text-muted hover:text-foreground',
        )}
      >
        {icon}
        <span className="hidden 2xl:inline">{label}</span>
      </button>
    </Tooltip>
  )
}

export function RoomWorkspace({ className, mapClassName }: { className?: string; mapClassName?: string }) {
  const data = useMapData()
  const ui = useUiStore()
  const session = useSession()
  const updateReceiver = useRoomDraftStore((s) => s.updateReceiver)
  const [camera, setCamera] = useState<CameraCommand>({ preset: 'iso', seq: 0 })
  const { view, asset, now } = data.tracking
  const editing = data.room.editing

  const mapProps = {
    config: data.config,
    zones: data.zones,
    receivers: data.receivers,
    asset: data.asset,
    activeZoneId: data.activeZoneId,
    selection: ui.selection,
    onSelect: ui.setSelection,
    showGrid: ui.showGrid,
    showZones: ui.showZones,
    trail: data.trail,
    circles: data.circles,
  }

  const statusOverlay = !view.hasLivePosition && (
    <div className="pointer-events-none absolute top-2 left-2 z-10 max-w-[min(26rem,calc(100%-18rem))]">
      <div
        className={cn(
          'rounded-md border px-3 py-1.5 text-xs font-medium shadow-lg shadow-black/30 backdrop-blur-sm',
          view.tone === 'danger' ? 'border-danger/40 bg-danger/15 text-danger' : 'border-warn/40 bg-[#2a2210]/90 text-warn',
        )}
      >
        {view.message}
      </div>
    </div>
  )

  return (
    <Card className={cn('flex flex-col', className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <Layers className="size-3.5 text-accent" />
          <h2 className="text-[13px] font-semibold">Room map</h2>
          <span className="font-mono text-[11px] text-muted tabular">
            {data.config.width} × {data.config.length} × {data.config.height} m
          </span>
          {session.mode === 'demo' && <Badge tone="demo">Simulated</Badge>}
          {editing && <Badge tone="info">Edit mode</Badge>}
        </div>
        <Segmented
          label="Map view"
          value={ui.view}
          onChange={ui.setView}
          options={[
            { value: '2d', label: '2D', icon: <Square /> },
            { value: '3d', label: '3D', icon: <Box /> },
          ]}
        />
        <EditModeToggle compact />
        <div className="flex items-center gap-1">
          <LayerToggle active={ui.showGrid} onClick={() => ui.set({ showGrid: !ui.showGrid })} icon={<Grid3x3 />} label="Grid" />
          <LayerToggle active={ui.showZones} onClick={() => ui.set({ showZones: !ui.showZones })} icon={<Hexagon />} label="Zones" hint="Voronoi zones from receiver positions" />
          <LayerToggle
            active={ui.showCircles}
            onClick={() => ui.set({ showCircles: !ui.showCircles })}
            icon={<Circle />}
            label="Range est."
            hint="Estimated ranges from active calibration models and current RSSI (estimates, not measurements)"
          />
          <LayerToggle active={ui.showTrail} onClick={() => ui.set({ showTrail: !ui.showTrail })} icon={<Route />} label="Trail" hint="Session-local trail of backend estimates" />
        </div>
        {ui.view === '3d' && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setCamera((c) => ({ preset: 'iso', seq: c.seq + 1 }))}>
              <View /> Iso
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCamera((c) => ({ preset: 'top', seq: c.seq + 1 }))}>
              <Square /> Top
            </Button>
          </div>
        )}
        <Button size="sm" variant="ghost" asChild>
          <Link to="/calibration">
            <Crosshair /> Calibrate
          </Link>
        </Button>
      </div>

      {editing && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-accent/[0.04] px-3 py-1.5">
          <span className="text-xs text-muted">
            {ui.view === '3d' ? 'Switch to 2D to drag receivers, or edit coordinates in the panel.' : 'Drag receivers or edit X/Y/Z in the panel. Changes are not saved until you press Save.'}
          </span>
          <SaveBar />
        </div>
      )}
      {data.room.usingDefaults && !data.room.query.isPending && (
        <Callout tone="danger" className="m-2 mb-0" title="Backend room configuration unavailable">
          The layout shown is the built-in default, not data from GET /config.
        </Callout>
      )}

      <div className={cn('relative min-h-0 flex-1 p-2', mapClassName)}>
        {ui.view === '2d' ? (
          <RoomMap2D
            {...mapProps}
            editable={editing}
            snapStep={ui.snapToGrid ? ui.snapStep : null}
            onReceiverMove={(id, pos) => updateReceiver(id, pos)}
            overlay={
              <>
                {statusOverlay}
                <SelectionCard selection={ui.selection} receivers={data.receivers} asset={asset} mapAsset={data.asset} view={view} now={now} onClose={() => ui.setSelection(null)} />
              </>
            }
          />
        ) : (
          <div className="relative h-full w-full">
            <Suspense fallback={<div className="grid h-full place-items-center text-xs text-muted">Loading 3D scene…</div>}>
              <RoomMap3D {...mapProps} camera={camera} />
            </Suspense>
            {statusOverlay}
            <SelectionCard selection={ui.selection} receivers={data.receivers} asset={asset} mapAsset={data.asset} view={view} now={now} onClose={() => ui.setSelection(null)} />
          </div>
        )}
      </div>
    </Card>
  )
}
