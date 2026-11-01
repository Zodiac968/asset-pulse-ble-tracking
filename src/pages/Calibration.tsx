import { CalibrationWizard } from '@/components/calibration/CalibrationWizard'
import { ActiveModelsCard } from '@/components/calibration/ModelsTable'
import { DemoControls } from '@/components/dashboard/DemoControls'
import { Callout } from '@/components/ui/misc'

export default function Calibration() {
  return (
    <div className="space-y-3 p-3 md:p-4">
      <Callout tone="info" title="Remote calibration through AWS">
        Place the beacon at a known position, sample real RSSI from each receiver via the backend, repeat at several spread-out positions, then fit and activate per-receiver
        path-loss models (d = 10^((P0 − RSSI) / 10n)). Recalibrate whenever the system moves to a new room or receivers are repositioned.
      </Callout>
      <CalibrationWizard />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ActiveModelsCard />
        <DemoControls />
      </div>
    </div>
  )
}
