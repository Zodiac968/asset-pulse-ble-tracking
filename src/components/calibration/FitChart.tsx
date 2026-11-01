import { useMemo } from 'react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip as RTooltip, XAxis, YAxis, ZAxis, type TooltipProps } from 'recharts'
import { RECEIVER_META } from '@/config/constants'
import type { CalibrationModel } from '@/types/calibration'
import { RECEIVER_IDS } from '@/types/room'
import { distanceToRssi } from '@/utils/signal'
import { EmptyState } from '../ui/misc'

interface Datum {
  d: number
  rssi: number
  count?: number
  receiver: string
  kind: 'measured' | 'model'
}

function FitTooltip({ active, payload }: TooltipProps<number, string>) {
  const p = payload?.[0]?.payload as Datum | undefined
  if (!active || !p || p.kind !== 'measured') return null
  return (
    <div className="rounded-md border border-border-strong bg-panel-raised px-2.5 py-1.5 text-[11px] shadow-lg">
      <div className="font-semibold text-foreground">{p.receiver}</div>
      <div className="font-mono text-muted tabular">
        d = {p.d.toFixed(2)} m · median {p.rssi.toFixed(1)} dBm · {p.count} samples
      </div>
    </div>
  )
}

/**
 * The per-point measurements the backend used for each fit (median RSSI vs
 * 3D distance, from the fit response's `points`), with the fitted curve
 * RSSI = P0 − 10·n·log10(d).
 */
export function FitChart({ models }: { models: Record<string, CalibrationModel> }) {
  const series = useMemo(
    () =>
      RECEIVER_IDS.map((id) => {
        const m = models[id]
        const label = RECEIVER_META[id].label
        const measured: Datum[] = (m?.measurements ?? []).map((x) => ({ d: x.distance, rssi: x.medianRssi, count: x.count, receiver: label, kind: 'measured' as const }))
        const maxD = Math.max(1, ...measured.map((x) => x.d)) * 1.1
        const curve: Datum[] =
          m?.p0 != null && m.n != null && measured.length
            ? Array.from({ length: 30 }, (_, i) => {
                const d = 0.25 + ((maxD - 0.25) * i) / 29
                return { d, rssi: distanceToRssi(d, m.p0!, m.n!), receiver: label, kind: 'model' as const }
              })
            : []
        return { id, measured, curve }
      }),
    [models],
  )

  if (!series.some((s) => s.measured.length > 0))
    return <EmptyState title="No fit measurements returned">No receiver had enough samples at distinct distances to fit.</EmptyState>

  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-foreground">
        {series.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: RECEIVER_META[s.id].color }} />
            {RECEIVER_META[s.id].label}
            {s.measured.length === 0 && <span className="text-subtle">(no data)</span>}
          </span>
        ))}
        <span className="text-subtle">dots = per-point median used by the fit · line = fitted model</span>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 14, left: 0 }}>
            <CartesianGrid stroke="#1c2834" />
            <XAxis
              dataKey="d"
              type="number"
              name="Distance"
              unit=" m"
              stroke="#3b4b5c"
              tick={{ fill: '#8b9aab', fontSize: 10 }}
              label={{ value: 'Distance to receiver (m)', position: 'insideBottom', offset: -8, fill: '#5c6b7c', fontSize: 10 }}
            />
            <YAxis dataKey="rssi" type="number" name="RSSI" domain={['auto', 'auto']} stroke="#3b4b5c" tick={{ fill: '#8b9aab', fontSize: 10 }} width={44} />
            <ZAxis range={[64, 64]} />
            <RTooltip content={<FitTooltip />} cursor={false} isAnimationActive={false} />
            {series.map((s) => (
              <Scatter key={`m-${s.id}`} data={s.measured} fill={RECEIVER_META[s.id].color} stroke="#121b25" strokeWidth={2} isAnimationActive={false} />
            ))}
            {series.map(
              (s) =>
                s.curve.length > 0 && (
                  <Scatter
                    key={`c-${s.id}`}
                    data={s.curve}
                    line={{ stroke: RECEIVER_META[s.id].color, strokeWidth: 2 }}
                    shape={() => <g />}
                    legendType="none"
                    isAnimationActive={false}
                  />
                ),
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
