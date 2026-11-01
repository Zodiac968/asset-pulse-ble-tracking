import { Gauge, Tag } from 'lucide-react'
import { BEACON } from '@/config/constants'
import { useAssetTracking } from '@/hooks/useAssetTracking'
import { useMapData } from '@/hooks/useMapData'
import { useUiStore } from '@/stores/uiStore'
import { formatAge, formatClock } from '@/utils/time'
import { Badge } from '../ui/badge'
import { Card, CardBody, CardHeader } from '../ui/card'
import { Callout, KeyValue } from '../ui/misc'
import { Tooltip } from '../ui/overlay'
import { useSession } from '../auth/SessionProvider'

export function AssetPanel() {
  const { asset, view, now, error } = useAssetTracking()
  const { asset: mapAsset } = useMapData()
  const setSelection = useUiStore((s) => s.setSelection)
  const { mode } = useSession()
  const live = view.hasLivePosition && asset
  const tone = view.tone === 'muted' ? 'muted' : view.tone

  return (
    <Card>
      <CardHeader
        icon={<Tag />}
        title={BEACON.name}
        description={`${BEACON.model} · non-connectable BLE tag`}
        actions={
          <button type="button" className="text-[11px] text-accent hover:underline" onClick={() => setSelection({ kind: 'asset' })}>
            Locate
          </button>
        }
      />
      <CardBody className="space-y-3 py-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-border bg-surface px-3 py-2">
            <div className="text-[11px] text-muted">Estimated X</div>
            <div className="font-mono text-lg font-semibold tabular">{live && asset.x !== null ? asset.x.toFixed(2) : '—'}<span className="ml-0.5 text-xs text-muted">m</span></div>
          </div>
          <div className="rounded-md border border-border bg-surface px-3 py-2">
            <div className="text-[11px] text-muted">Estimated Y</div>
            <div className="font-mono text-lg font-semibold tabular">{live && asset.y !== null ? asset.y.toFixed(2) : '—'}<span className="ml-0.5 text-xs text-muted">m</span></div>
          </div>
        </div>
        {!view.hasLivePosition && (
          <Callout tone={view.tone === 'danger' ? 'danger' : 'warn'} title={view.label}>
            {view.message}
            {view.status === 'api_disconnected' && error ? ` (${error.message})` : ''}
            {mapAsset && !mapAsset.live && ` Last known: (${mapAsset.x.toFixed(2)}, ${mapAsset.y.toFixed(2)}) m at ${formatClock(mapAsset.updatedAt)}.`}
          </Callout>
        )}
        <dl>
          <KeyValue label="MAC address" value={asset?.beaconId ?? BEACON.mac} mono />
          <KeyValue label="Status" value={<Badge tone={tone}>{view.label}</Badge>} />
          <KeyValue label="Current zone" value={view.hasLivePosition ? (asset?.currentZone ?? '—') : 'Unknown'} />
          <KeyValue label="Nearest receiver" value={view.hasLivePosition ? (asset?.nearestReceiver ?? '—') : '—'} mono />
          <KeyValue label="Last update" value={asset?.updatedAt ? `${formatClock(asset.updatedAt)} · ${formatAge(now - asset.updatedAt)}` : '—'} />
          <KeyValue label="Receivers used" value={asset?.receiversUsed ?? '—'} />
          <KeyValue label="Assumed height (Z)" value={<span className="text-muted">configured, not measured</span>} />
        </dl>
        {mode === 'demo' && <p className="text-[11px] text-[#f9a8d4]">Demo Mode: positions come from the simulator's known coordinates.</p>}
      </CardBody>
    </Card>
  )
}

export function DiagnosticsPanel() {
  const { asset, now, status } = useAssetTracking()
  const newest = Math.max(0, ...Object.values(asset?.receivers ?? {}).map((r) => r?.updatedAt ?? 0)) || null
  return (
    <Card>
      <CardHeader icon={<Gauge />} title="Localization diagnostics" />
      <CardBody className="py-2.5">
        <dl>
          <KeyValue label="Method" value={asset?.method ?? '—'} mono />
          <KeyValue label="Backend status" value={asset?.rawStatus ?? '—'} mono />
          <KeyValue label="Fresh receivers" value={asset ? Object.keys(asset.receivers).length : '—'} />
          <KeyValue
            label={
              <Tooltip content="Fresh receivers that also have an activated calibration model. The backend needs three.">
                <span className="cursor-help border-b border-dotted border-subtle">Receivers used</span>
              </Tooltip>
            }
            value={asset?.receiversUsed ?? '—'}
          />
          <KeyValue
            label={
              <Tooltip content="Consistency between the fitted position and the model-derived receiver distances. It is not verified real-world positioning error.">
                <span className="cursor-help border-b border-dotted border-subtle">Range residual RMSE</span>
              </Tooltip>
            }
            value={asset?.rangeResidualRmseM != null && status === 'estimated' ? `${asset.rangeResidualRmseM.toFixed(2)} m` : '—'}
          />
          {/* /asset's updated_at is the computation time; freshness comes from the newest receiver reading. */}
          <KeyValue label="Data freshness" value={newest ? formatAge(now - newest) : '—'} />
          <KeyValue label="Computed" value={asset?.updatedAt ? formatAge(now - asset.updatedAt) : '—'} />
        </dl>
        <p className="mt-2 text-[11px] leading-relaxed text-subtle">
          Range residual RMSE measures internal model consistency, not physical accuracy. {asset?.message ? `Backend: ${asset.message}` : ''}
        </p>
      </CardBody>
    </Card>
  )
}
