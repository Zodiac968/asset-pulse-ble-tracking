import type { ReactNode } from 'react'
import { Clock, Crosshair, Hexagon, Radio, Tag } from 'lucide-react'
import { useAssetTracking } from '@/hooks/useAssetTracking'
import { useReceiverStatus } from '@/hooks/useReceiverStatus'
import { formatAge } from '@/utils/time'
import { cn } from '@/utils/cn'
import { StatusDot } from '../ui/badge'

function Kpi({ icon, label, value, sub, tone = 'muted' }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'danger' | 'info' | 'muted' }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-panel px-3.5 py-2.5">
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-panel-raised text-accent [&_svg]:size-3.5">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</div>
        <div className="flex items-center gap-1.5 truncate text-[15px] font-semibold text-foreground tabular">
          {tone !== 'muted' && <StatusDot tone={tone} pulse={tone === 'ok'} />}
          {value}
        </div>
        {sub && <div className="truncate text-[11px] text-subtle">{sub}</div>}
      </div>
    </div>
  )
}

export function KpiStrip({ className }: { className?: string }) {
  const { asset, view, now, status } = useAssetTracking()
  const { onlineCount, total, receivers } = useReceiverStatus()
  const lastDetection = Math.max(0, ...receivers.map((r) => r.lastSeen ?? 0)) || null
  const detected = lastDetection !== null && now - lastDetection < 15_000

  return (
    <div className={cn('grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5', className)}>
      <Kpi icon={<Tag />} label="Active assets" value={detected ? '1 / 1' : '0 / 1'} sub={detected ? 'Beacon detected' : 'Beacon not detected recently'} tone={detected ? 'ok' : 'warn'} />
      <Kpi
        icon={<Radio />}
        label="Online receivers"
        value={`${onlineCount} / ${total}`}
        sub={receivers.filter((r) => r.link !== 'online').map((r) => r.short).join(', ') ? `Not online: ${receivers.filter((r) => r.link !== 'online').map((r) => r.short).join(', ')}` : 'All reporting'}
        tone={onlineCount === total ? 'ok' : onlineCount > 0 ? 'warn' : 'danger'}
      />
      <Kpi icon={<Hexagon />} label="Estimated zone" value={view.hasLivePosition ? (asset?.currentZone ?? '—') : 'Unknown'} sub={view.hasLivePosition ? `Nearest receiver ${asset?.nearestReceiver ?? '—'}` : 'Requires a position estimate'} />
      <Kpi icon={<Crosshair />} label="Localization" value={view.label} sub={status === 'estimated' ? `${asset?.receiversUsed ?? '—'} receivers used` : view.message} tone={view.tone === 'muted' ? 'muted' : view.tone} />
      <Kpi icon={<Clock />} label="Last beacon detection" value={lastDetection ? formatAge(now - lastDetection) : '—'} sub={lastDetection ? new Date(lastDetection).toLocaleTimeString([], { hour12: false }) : 'No observation this session'} />
    </div>
  )
}
