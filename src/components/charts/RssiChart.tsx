import { useMemo, useState } from 'react'
import { Activity, Table2 } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, type TooltipProps } from 'recharts'
import { RECEIVER_META } from '@/config/constants'
import { useHistoryStore } from '@/stores/historyStore'
import { RECEIVER_IDS, type ReceiverId } from '@/types/room'
import { formatClock } from '@/utils/time'
import { cn } from '@/utils/cn'
import { Badge } from '../ui/badge'
import { Card, CardHeader } from '../ui/card'
import { EmptyState, Segmented } from '../ui/misc'

type Series = 'raw' | 'filtered'
type Row = { t: number } & Partial<Record<ReceiverId, number | null>>

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border-strong bg-panel-raised px-2.5 py-1.5 text-[11px] shadow-lg shadow-black/40">
      <div className="mb-1 font-mono text-muted">{formatClock(Number(label))}</div>
      {RECEIVER_IDS.map((id) => {
        const p = payload.find((x) => x.dataKey === id)
        const v = p?.value
        return (
          <div key={id} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-foreground">
              <span className="h-0.5 w-3 rounded" style={{ background: RECEIVER_META[id].color }} />
              {RECEIVER_META[id].label}
            </span>
            <span className="font-mono text-foreground tabular">{typeof v === 'number' ? `${v.toFixed(1)} dBm` : 'no data'}</span>
          </div>
        )
      })}
    </div>
  )
}

export function RssiChart({ height = 220, className, title = 'Live RSSI' }: { height?: number; className?: string; title?: string }) {
  const rssi = useHistoryStore((s) => s.rssi)
  const [series, setSeries] = useState<Series>('filtered')
  const [table, setTable] = useState(false)

  const rows: Row[] = useMemo(
    () =>
      rssi.map((r) => {
        const row: Row = { t: r.t }
        for (const id of RECEIVER_IDS) {
          const v = r.values[id]
          row[id] = v ? (series === 'raw' ? v.raw : (v.filtered ?? v.raw)) : null
        }
        return row
      }),
    [rssi, series],
  )

  const latest = rows[rows.length - 1]
  const values = rows.flatMap((r) => RECEIVER_IDS.map((id) => r[id])).filter((v): v is number => typeof v === 'number')
  const lo = values.length ? Math.floor((Math.min(...values) - 4) / 5) * 5 : -100
  const hi = values.length ? Math.ceil((Math.max(...values) + 4) / 5) * 5 : -30

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        icon={<Activity />}
        title={
          <>
            {title} <Badge tone="muted">Session history</Badge>
          </>
        }
        description="Sampled at each poll in this browser session; not persistent AWS history. Gaps = no fresh observation."
        actions={
          <>
            <Segmented
              size="sm"
              label="RSSI series"
              value={series}
              onChange={setSeries}
              options={[
                { value: 'filtered', label: 'Filtered' },
                { value: 'raw', label: 'Raw' },
              ]}
            />
            <button
              type="button"
              aria-pressed={table}
              aria-label="Show data table"
              onClick={() => setTable((t) => !t)}
              className={cn('grid size-6 place-items-center rounded border', table ? 'border-accent/40 text-accent' : 'border-border-strong text-muted hover:text-foreground')}
            >
              <Table2 className="size-3.5" />
            </button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-2.5 text-[11px]" aria-label="Legend">
        {RECEIVER_IDS.map((id) => {
          const v = latest?.[id]
          return (
            <span key={id} className="flex items-center gap-1.5 text-foreground">
              <span className="h-0.5 w-4 rounded" style={{ background: RECEIVER_META[id].color }} />
              {RECEIVER_META[id].label}
              <span className="font-mono text-muted tabular">{typeof v === 'number' ? `${v.toFixed(1)} dBm` : ''}</span>
              {rows.length > 0 && typeof v !== 'number' && <Badge tone="warn">stale</Badge>}
            </span>
          )
        })}
        <span className="ml-auto text-subtle">Higher (closer to 0) = stronger</span>
      </div>
      {rows.length < 2 ? (
        <EmptyState icon={<Activity />} title="Collecting session data…">
          RSSI points appear here as tracking results arrive.
        </EmptyState>
      ) : table ? (
        <div className="scrollbar-thin max-h-[260px] overflow-auto px-4 py-2">
          <table className="w-full text-[11px] tabular">
            <thead className="sticky top-0 bg-panel text-left text-muted">
              <tr>
                <th className="py-1 font-medium">Time</th>
                {RECEIVER_IDS.map((id) => (
                  <th key={id} className="py-1 text-right font-medium">
                    {RECEIVER_META[id].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              {rows
                .slice(-40)
                .reverse()
                .map((r) => (
                  <tr key={r.t} className="border-t border-border">
                    <td className="py-0.5 text-muted">{formatClock(r.t)}</td>
                    {RECEIVER_IDS.map((id) => (
                      <td key={id} className="py-0.5 text-right">
                        {typeof r[id] === 'number' ? (r[id] as number).toFixed(1) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-1 pt-1 pb-2" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#1c2834" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                scale="time"
                tickFormatter={(t: number) => formatClock(t)}
                stroke="#3b4b5c"
                tick={{ fill: '#8b9aab', fontSize: 10 }}
                tickLine={false}
                minTickGap={48}
              />
              <YAxis
                domain={[lo, hi]}
                stroke="#3b4b5c"
                tick={{ fill: '#8b9aab', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(v: number) => `${v}`}
                label={{ value: 'dBm', angle: -90, position: 'insideLeft', fill: '#5c6b7c', fontSize: 10, dx: 10 }}
              />
              <RTooltip content={<ChartTooltip />} cursor={{ stroke: '#5c6b7c', strokeDasharray: '3 3' }} isAnimationActive={false} />
              {RECEIVER_IDS.map((id) => (
                <Line
                  key={id}
                  dataKey={id}
                  name={RECEIVER_META[id].label}
                  stroke={RECEIVER_META[id].color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: '#121b25', strokeWidth: 2 }}
                  connectNulls={false}
                  isAnimationActive={false}
                  type="monotone"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
