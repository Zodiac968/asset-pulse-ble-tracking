import { X } from 'lucide-react'
import { BEACON } from '@/config/constants'
import type { MapAsset } from '@/components/room/types'
import type { Selection } from '@/stores/uiStore'
import type { AssetState, ReceiverView } from '@/types/tracking'
import type { LocalizationView } from '@/utils/localization'
import { LINK_LABEL } from '@/utils/receivers'
import { formatDbm } from '@/utils/signal'
import { formatAge, formatClock } from '@/utils/time'
import { Badge } from '../ui/badge'
import { KeyValue } from '../ui/misc'

const linkTone = { online: 'ok', no_recent: 'warn', offline: 'danger', unconfigured: 'muted' } as const

export function SelectionCard({
  selection,
  receivers,
  asset,
  mapAsset,
  view,
  now,
  onClose,
}: {
  selection: Selection
  receivers: ReceiverView[]
  asset: AssetState | undefined
  mapAsset: MapAsset | null
  view: LocalizationView
  now: number
  onClose: () => void
}) {
  if (!selection) return null
  const r = selection.kind === 'receiver' ? receivers.find((x) => x.id === selection.id) : null
  return (
    <div className="absolute top-2 right-2 z-10 w-64 rounded-md border border-border-strong bg-panel/95 shadow-xl shadow-black/40 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs font-semibold">
          {r ? (
            <>
              <span className="size-2 rounded-full" style={{ background: r.color }} />
              {r.label}
            </>
          ) : (
            <>
              <span className="size-2 rounded-full bg-asset" />
              {BEACON.name}
            </>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded p-0.5 text-muted hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
      <dl className="px-3 py-1.5">
        {r ? (
          <>
            <KeyValue label="Receiver ID" value={r.id} mono />
            <KeyValue label="Position" value={r.position ? `${r.position.x.toFixed(2)}, ${r.position.y.toFixed(2)}, ${r.position.z.toFixed(2)} m` : '—'} />
            <KeyValue label="RSSI" value={formatDbm(r.observation?.rssi ?? null)} />
            <KeyValue label="Filtered" value={formatDbm(r.observation?.filteredRssi ?? null, 1)} />
            <KeyValue label="Last seen" value={r.lastSeen ? `${formatClock(r.lastSeen)} (${formatAge(r.ageMs)})` : 'Not this session'} />
            <KeyValue label="Status" value={<Badge tone={linkTone[r.link]}>{LINK_LABEL[r.link]}</Badge>} />
          </>
        ) : (
          <>
            <KeyValue label="Beacon MAC" value={asset?.beaconId ?? BEACON.mac} mono />
            <KeyValue label="Estimated" value={mapAsset && mapAsset.live ? `${mapAsset.x.toFixed(2)}, ${mapAsset.y.toFixed(2)} m` : 'Unavailable'} />
            {mapAsset && !mapAsset.live && <KeyValue label="Last known" value={`${mapAsset.x.toFixed(2)}, ${mapAsset.y.toFixed(2)} m (historical)`} />}
            <KeyValue label="Zone" value={view.hasLivePosition ? (asset?.currentZone ?? '—') : 'Unknown'} />
            <KeyValue label="Detection" value={<Badge tone={view.tone === 'muted' ? 'muted' : view.tone}>{view.label}</Badge>} />
            <KeyValue label="Method" value={asset?.method ?? '—'} mono />
            <KeyValue label="Freshness" value={asset?.updatedAt ? formatAge(now - asset.updatedAt) : '—'} />
          </>
        )}
      </dl>
    </div>
  )
}
