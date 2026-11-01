import { ArrowRight, Crosshair } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCalibration } from '@/hooks/useCalibration'
import { useRoomConfiguration } from '@/hooks/useRoomConfiguration'
import { RECEIVER_IDS } from '@/types/room'
import { formatDateTime } from '@/utils/time'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardBody, CardHeader } from '../ui/card'
import { Callout, KeyValue } from '../ui/misc'

export function CalibrationSummary({ className }: { className?: string }) {
  const cal = useCalibration()
  const { savedAt } = useRoomConfiguration()
  const models = cal.modelsQuery.data
  const activeCount = models ? RECEIVER_IDS.filter((id) => models.models[id]).length : 0
  const outdated = models?.appliedAt != null && savedAt != null && savedAt > models.appliedAt

  return (
    <Card className={className}>
      <CardHeader
        icon={<Crosshair />}
        title="Calibration status"
        actions={
          <Button size="sm" variant="ghost" asChild>
            <Link to="/calibration">
              Open wizard <ArrowRight />
            </Link>
          </Button>
        }
      />
      <CardBody className="space-y-2 py-2.5">
        <dl>
          <KeyValue label="Active models" value={<Badge tone={activeCount === 3 ? 'ok' : activeCount > 0 ? 'warn' : 'muted'}>{models ? `${activeCount}/3` : '—'}</Badge>} />
          <KeyValue label="Activated" value={models?.appliedAt ? formatDateTime(models.appliedAt) : '—'} />
          <KeyValue label="Session" value={cal.sessionId ?? (cal.statusQuery.data?.state === 'none' ? 'None' : '—')} mono />
          <KeyValue label="Sampling" value={cal.isSampling ? <Badge tone="ok">In progress</Badge> : 'Idle'} />
          <KeyValue label="Completed positions" value={cal.completed.length} />
        </dl>
        {outdated && <Callout tone="warn">Layout saved after the last calibration — recalibration may be required.</Callout>}
        {cal.modelsQuery.isError && <Callout tone="danger">{cal.modelsQuery.error.message}</Callout>}
      </CardBody>
    </Card>
  )
}
