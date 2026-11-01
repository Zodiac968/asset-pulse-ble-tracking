import { MoveDiagonal } from 'lucide-react'
import { CalibrationSummary } from '@/components/calibration/CalibrationSummary'
import { RssiChart } from '@/components/charts/RssiChart'
import { DemoControls } from '@/components/dashboard/DemoControls'
import { KpiStrip } from '@/components/dashboard/KpiStrip'
import { ReceiverEditor, RoomConfigPanel } from '@/components/room/RoomControls'
import { RoomWorkspace } from '@/components/room/RoomWorkspace'
import { AssetPanel, DiagnosticsPanel } from '@/components/tracking/AssetPanel'
import { EventFeed } from '@/components/tracking/EventFeed'
import { ReceiverSignalList } from '@/components/tracking/ReceiverSignalList'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { useReceiverStatus } from '@/hooks/useReceiverStatus'
import { useRoomConfiguration } from '@/hooks/useRoomConfiguration'
import { useUiStore } from '@/stores/uiStore'

export default function LiveTracking() {
  const { editing } = useRoomConfiguration()
  const { receivers } = useReceiverStatus()
  const { selection, setSelection } = useUiStore()
  const selectedId = selection?.kind === 'receiver' ? selection.id : null

  return (
    <div className="space-y-3 p-3 md:p-4">
      <KpiStrip />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <RoomWorkspace className="h-[clamp(460px,70vh,860px)]" />
        <aside className="space-y-3 xl:max-h-[clamp(460px,70vh,860px)] xl:overflow-y-auto xl:pr-0.5 scrollbar-thin" aria-label="Tracking details">
          {editing && (
            <>
              <Card>
                <CardHeader icon={<MoveDiagonal />} title="Receiver position" description="Same state as dragging on the map" />
                <CardBody className="py-3">
                  <ReceiverEditor receivers={receivers} selectedId={selectedId} onSelect={(id) => setSelection({ kind: 'receiver', id })} />
                </CardBody>
              </Card>
              <RoomConfigPanel />
            </>
          )}
          <AssetPanel />
          <ReceiverSignalList />
          <DiagnosticsPanel />
          {!editing && (
            <Card>
              <CardHeader icon={<MoveDiagonal />} title="Receiver coordinates" description="Locked in Live mode" />
              <CardBody className="py-3">
                <ReceiverEditor receivers={receivers} selectedId={selectedId} onSelect={(id) => setSelection({ kind: 'receiver', id })} />
              </CardBody>
            </Card>
          )}
          <DemoControls />
        </aside>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <RssiChart />
        <EventFeed />
        <CalibrationSummary />
      </div>
    </div>
  )
}
