import { useMemo } from 'react'
import { Gauge, Hexagon, SignalHigh, Timer } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { RssiChart } from '@/components/charts/RssiChart'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Callout, EmptyState, KeyValue } from '@/components/ui/misc'
import { RECEIVER_META } from '@/config/constants'
import { useNow } from '@/hooks/useNow'
import { useHistoryStore } from '@/stores/historyStore'
import { RECEIVER_IDS } from '@/types/room'
import type { LocalizationStatus } from '@/types/tracking'
import { describeLocalization } from '@/utils/localization'
import { mean } from '@/utils/signal'
import { formatAge, formatClock, formatDuration } from '@/utils/time'

const FLOOR = -100
const CEIL = -30
const pct = (v: number) => `${((Math.min(CEIL, Math.max(FLOOR, v)) - FLOOR) / (CEIL - FLOOR)) * 100}%`

function SignalComparison() {
  const rssi = useHistoryStore((s) => s.rssi)
  const stats = useMemo(
    () =>
      RECEIVER_IDS.map((id) => {
        const vals = rssi.map((r) => r.values[id]?.raw).filter((v): v is number => typeof v === 'number')
        return {
          id,
          n: vals.length,
          min: vals.length ? Math.min(...vals) : null,
          max: vals.length ? Math.max(...vals) : null,
          mean: mean(vals),
          latest: rssi.length ? (rssi[rssi.length - 1]!.values[id]?.raw ?? null) : null,
          availability: rssi.length ? vals.length / rssi.length : 0,
        }
      }),
    [rssi],
  )
  return (
    <Card>
      <CardHeader icon={<SignalHigh />} title="Signal-strength comparison" description="Raw RSSI range (bar), session mean (tick) and latest (dot). Right = stronger." actions={<Badge tone="muted">Session history</Badge>} />
      <CardBody className="space-y-3">
        <div className="relative ml-24 flex justify-between font-mono text-[10px] text-subtle">
          {[-100, -85, -70, -55, -40, -30].map((v) => (
            <span key={v}>{v}</span>
          ))}
        </div>
        {stats.map((s) => (
          <div key={s.id} className="flex items-center gap-3">
            <span className="flex w-21 shrink-0 items-center gap-1.5 text-xs">
              <span className="size-2 rounded-full" style={{ background: RECEIVER_META[s.id].color }} />
              {RECEIVER_META[s.id].label}
            </span>
            <div className="relative h-5 flex-1 rounded bg-surface" role="img" aria-label={s.mean !== null ? `${RECEIVER_META[s.id].label}: min ${s.min}, mean ${s.mean.toFixed(1)}, max ${s.max} dBm` : `${RECEIVER_META[s.id].label}: no data`}>
              {s.min !== null && s.max !== null && (
                <div className="absolute top-1.5 h-2 rounded-full opacity-40" style={{ left: pct(s.min), width: `calc(${pct(s.max)} - ${pct(s.min)} + 2px)`, background: RECEIVER_META[s.id].color }} />
              )}
              {s.mean !== null && <div className="absolute top-0.5 h-4 w-0.5 rounded bg-foreground" style={{ left: pct(s.mean) }} />}
              {typeof s.latest === 'number' && <div className="absolute top-1 size-3 -translate-x-1/2 rounded-full ring-2 ring-panel" style={{ left: pct(s.latest), background: RECEIVER_META[s.id].color }} />}
              {s.n === 0 && <span className="absolute inset-0 grid place-items-center text-[10px] text-subtle">no observations this session</span>}
            </div>
            <span className="w-28 shrink-0 text-right font-mono text-[11px] text-muted tabular">{s.mean !== null ? `μ ${s.mean.toFixed(1)} dBm` : '—'}</span>
          </div>
        ))}
        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
          {stats.map((s) => (
            <div key={s.id} className="text-center">
              <div className="text-[11px] text-muted">{RECEIVER_META[s.id].short} fresh in polls</div>
              <div className="font-mono text-sm font-semibold tabular">{Math.round(s.availability * 100)}%</div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}

function ZoneTransitions() {
  const transitions = useHistoryStore((s) => s.zoneTransitions)
  const now = useNow()
  const dwell = useMemo(() => {
    const out: Record<string, number> = {}
    transitions.forEach((t, i) => {
      const end = transitions[i + 1]?.t ?? now
      out[t.to] = (out[t.to] ?? 0) + (end - t.t)
    })
    return out
  }, [transitions, now])
  return (
    <Card>
      <CardHeader icon={<Hexagon />} title="Zone transitions" actions={<Badge tone="muted">Session history</Badge>} description="Estimated-zone changes observed in this session (only while a position estimate is valid)." />
      {transitions.length === 0 ? (
        <EmptyState icon={<Hexagon />} title="No zone data yet">Zones are recorded only when the backend returns a valid position estimate.</EmptyState>
      ) : (
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(dwell).map(([zone, ms]) => (
              <div key={zone} className="rounded-md border border-border bg-surface px-2.5 py-1.5">
                <div className="text-[11px] text-muted">{zone}</div>
                <div className="font-mono text-sm tabular">{formatDuration(ms)}</div>
              </div>
            ))}
          </div>
          <ol className="scrollbar-thin max-h-48 overflow-y-auto text-xs">
            {[...transitions].reverse().map((t) => (
              <li key={t.t} className="flex gap-3 border-t border-border py-1">
                <span className="font-mono text-subtle">{formatClock(t.t)}</span>
                <span>{t.from ?? 'start'} → <b>{t.to}</b></span>
              </li>
            ))}
          </ol>
        </CardBody>
      )}
    </Card>
  )
}

function LocalizationDiagnostics() {
  const { diagnostics, statusCounts, polls, startedAt, lastSeen } = useHistoryStore()
  const now = useNow()
  const total = Object.values(statusCounts).reduce((a, b) => a + (b ?? 0), 0)
  const rmseRows = diagnostics.filter((d) => d.rmse !== null && d.status === 'estimated')
  return (
    <Card>
      <CardHeader icon={<Gauge />} title="Localization diagnostics" actions={<Badge tone="muted">Session history</Badge>} />
      <CardBody className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <dl>
            <KeyValue label="Session started" value={`${formatClock(startedAt)} (${formatAge(now - startedAt)})`} />
            <KeyValue label="Successful polls" value={polls.ok} />
            <KeyValue label="Failed polls" value={polls.failed} />
            {RECEIVER_IDS.map((id) => (
              <KeyValue key={id} label={`${RECEIVER_META[id].label} last data`} value={lastSeen[id] ? formatAge(now - lastSeen[id]!) : 'none'} />
            ))}
          </dl>
          <div className="space-y-1.5">
            {(Object.keys(statusCounts) as LocalizationStatus[]).map((s) => {
              const v = describeLocalization(s)
              const n = statusCounts[s] ?? 0
              return (
                <div key={s} className="flex items-center gap-2 text-xs">
                  <span className="w-36 shrink-0">
                    <Badge tone={v.tone === 'muted' ? 'muted' : v.tone}>{v.label}</Badge>
                  </span>
                  <div className="h-1.5 flex-1 rounded-full bg-surface">
                    <div className="h-full rounded-full bg-muted" style={{ width: `${(n / Math.max(1, total)) * 100}%` }} />
                  </div>
                  <span className="w-16 text-right font-mono text-muted tabular">{Math.round((n / Math.max(1, total)) * 100)}%</span>
                </div>
              )
            })}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium">Range residual RMSE (m)</div>
          <p className="mb-2 text-[11px] text-subtle">Internal consistency of each fit — not verified positioning accuracy.</p>
          {rmseRows.length < 2 ? (
            <EmptyState title="No residual data">Shown when the backend supplies range_residual_rmse_m with an estimate.</EmptyState>
          ) : (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rmseRows} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#1c2834" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => formatClock(t)} stroke="#3b4b5c" tick={{ fill: '#8b9aab', fontSize: 10 }} minTickGap={48} />
                  <YAxis stroke="#3b4b5c" tick={{ fill: '#8b9aab', fontSize: 10 }} width={36} axisLine={false} />
                  <RTooltip
                    isAnimationActive={false}
                    labelFormatter={(t) => formatClock(Number(t))}
                    formatter={(v) => [`${Number(v).toFixed(2)} m`, 'Residual RMSE']}
                    contentStyle={{ background: '#17222e', border: '1px solid #2b3b4d', borderRadius: 6, fontSize: 11 }}
                  />
                  <Line dataKey="rmse" stroke="#f472b6" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

export default function Analytics() {
  const clear = useHistoryStore((s) => s.clear)
  return (
    <div className="space-y-3 p-3 md:p-4">
      <Callout
        tone="info"
        title="Session analytics"
        action={
          <button type="button" onClick={clear} className="flex items-center gap-1 text-[11px] text-accent hover:underline">
            <Timer className="size-3" /> Reset session
          </button>
        }
      >
        The backend stores only the latest observation per receiver, so everything on this page is accumulated in this browser tab and is lost on reload. No persistent history
        is fabricated.
      </Callout>
      <RssiChart height={300} title="Session RSSI" />
      <div className="grid gap-3 lg:grid-cols-2">
        <SignalComparison />
        <ZoneTransitions />
      </div>
      <LocalizationDiagnostics />
    </div>
  )
}
