import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react'
import { RECEIVER_META } from '@/config/constants'
import { useCalibrationModels } from '@/hooks/useCalibration'
import { useRoomConfiguration } from '@/hooks/useRoomConfiguration'
import type { CalibrationModel } from '@/types/calibration'
import { RECEIVER_IDS } from '@/types/room'
import { formatDateTime } from '@/utils/time'
import { Badge } from '../ui/badge'
import { Card, CardBody, CardHeader } from '../ui/card'
import { Callout, EmptyState } from '../ui/misc'

const fmt = (v: number | null, d: number, unit = '') => (v === null ? '—' : `${v.toFixed(d)}${unit}`)

export function ModelsTable({ models, showValidation = true }: { models: Record<string, CalibrationModel | undefined>; showValidation?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular">
        <thead className="text-left text-[11px] text-muted">
          <tr className="border-b border-border">
            <th className="py-1.5 pr-3 font-medium">Receiver</th>
            <th className="py-1.5 pr-3 text-right font-medium">P0 (1 m)</th>
            <th className="py-1.5 pr-3 text-right font-medium">n</th>
            <th className="py-1.5 pr-3 text-right font-medium">RSSI RMSE</th>
            <th className="py-1.5 pr-3 text-right font-medium">Samples used</th>
            {showValidation && <th className="py-1.5 font-medium">Validation</th>}
          </tr>
        </thead>
        <tbody>
          {RECEIVER_IDS.map((id) => {
            const m = models[id]
            return (
              <tr key={id} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 pr-3">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="size-2 rounded-full" style={{ background: RECEIVER_META[id].color }} />
                    {RECEIVER_META[id].label}
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-right font-mono">{fmt(m?.p0 ?? null, 1, ' dBm')}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{fmt(m?.n ?? null, 2)}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{fmt(m?.rmseDb ?? null, 2, ' dB')}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{m?.samples ?? '—'}</td>
                {showValidation && (
                  <td className="py-1.5">
                    {!m ? (
                      <Badge tone="muted">No model</Badge>
                    ) : m.valid === true ? (
                      <Badge tone="ok">
                        <CheckCircle2 /> Valid
                      </Badge>
                    ) : m.valid === false ? (
                      <Badge tone="danger" title={m.reason ?? undefined}>
                        <XCircle /> Invalid
                      </Badge>
                    ) : (
                      <Badge tone="muted">Not reported</Badge>
                    )}
                    {m?.reason && m.valid === false && <div className="mt-0.5 max-w-56 text-[11px] text-muted">{m.reason}</div>}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Models currently activated on the backend (GET /calibration/models). */
export function ActiveModelsCard({ className }: { className?: string }) {
  const q = useCalibrationModels()
  const { savedAt } = useRoomConfiguration()
  const data = q.data
  const outdated = data?.appliedAt != null && savedAt != null && savedAt > data.appliedAt
  const count = data ? Object.keys(data.models).length : 0
  return (
    <Card className={className}>
      <CardHeader
        icon={<ShieldCheck />}
        title="Active calibration models"
        description={data?.appliedAt ? `Activated ${formatDateTime(data.appliedAt)}${data.sessionId ? ` · session ${data.sessionId}` : ''}` : 'From GET /calibration/models'}
        actions={<Badge tone={count === 3 ? 'ok' : count > 0 ? 'warn' : 'muted'}>{count}/3 active</Badge>}
      />
      <CardBody className="space-y-2.5">
        {q.isError && <Callout tone="danger" title="Could not load active models">{q.error.message}</Callout>}
        {outdated && (
          <Callout tone="warn" title="Calibration is older than the latest layout change">
            The room configuration was saved after these models were activated. Recalibrate if receivers were physically moved.
          </Callout>
        )}
        {q.isPending ? <EmptyState title="Loading…" /> : data && count === 0 ? <EmptyState title="No active models">The backend reports no activated calibration.</EmptyState> : data && <ModelsTable models={data.models} showValidation={false} />}
      </CardBody>
    </Card>
  )
}
