import { useState, useSyncExternalStore } from 'react'
import { FlaskConical, MapPin, RotateCcw, WifiOff } from 'lucide-react'
import { RECEIVER_META } from '@/config/constants'
import { getDemoSimulator } from '@/services/mockApi'
import { RECEIVER_IDS } from '@/types/room'
import { useSession } from '../auth/SessionProvider'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardBody, CardHeader } from '../ui/card'
import { NumberField } from '../ui/form'
import { SectionLabel } from '../ui/misc'
import { Switch } from '../ui/switch'

/** Simulator controls. Rendered only in Demo Mode; never affects live data. */
export function DemoControls({ className }: { className?: string }) {
  const { mode } = useSession()
  if (mode !== 'demo') return null
  return <DemoControlsInner className={className} />
}

function DemoControlsInner({ className }: { className?: string }) {
  const sim = getDemoSimulator()
  const snap = useSyncExternalStore(sim.subscribe, sim.getSnapshot)
  const [x, setX] = useState(3)
  const [y, setY] = useState(2)

  return (
    <Card className={className}>
      <CardHeader icon={<FlaskConical />} title="Demo controls" actions={<Badge tone="demo">Simulated data</Badge>} description="Drive the simulator. Nothing here touches AWS." />
      <CardBody className="space-y-3.5">
        <div>
          <SectionLabel>Move asset</SectionLabel>
          <div className="flex items-end gap-2">
            <NumberField compact label="X" unit="m" value={x} onCommit={setX} className="flex-1" />
            <NumberField compact label="Y" unit="m" value={y} onCommit={setY} className="flex-1" />
            <Button size="sm" onClick={() => sim.moveAssetTo({ x, y })}>
              <MapPin /> Go
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {RECEIVER_IDS.map((id) => (
              <Button key={id} size="sm" variant="outline" onClick={() => sim.chooseZone(id)}>
                <span className="size-2 rounded-full" style={{ background: RECEIVER_META[id].color }} />
                {RECEIVER_META[id].zone}
              </Button>
            ))}
          </div>
          <Switch className="mt-2.5" label="Wander automatically" checked={snap.wander} onCheckedChange={(v) => sim.setWander(v)} />
          <p className="mt-1 font-mono text-[11px] text-subtle tabular">
            simulated truth ({snap.truePosition.x.toFixed(2)}, {snap.truePosition.y.toFixed(2)}) m
          </p>
        </div>
        <div>
          <SectionLabel>Receiver availability</SectionLabel>
          <div className="space-y-1.5">
            {RECEIVER_IDS.map((id) => (
              <Switch key={id} label={RECEIVER_META[id].label} checked={snap.receiverEnabled[id]} onCheckedChange={(v) => sim.setReceiverEnabled(id, v)} />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={snap.signalLoss ? 'danger' : 'warn'} onClick={() => sim.setSignalLoss(!snap.signalLoss)} aria-pressed={snap.signalLoss}>
            <WifiOff /> {snap.signalLoss ? 'Signal lost (click to end)' : 'Simulate signal loss'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => sim.restoreNormal()}>
            <RotateCcw /> Restore normal
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}
