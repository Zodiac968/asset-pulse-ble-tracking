import { Cpu, Radio, Tag } from 'lucide-react'
import { linkTone } from '@/components/tracking/ReceiverSignalList'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Callout, KeyValue } from '@/components/ui/misc'
import { BEACON, RECEIVER_META, RECEIVER_OFFLINE_MS, RECEIVER_STALE_MS } from '@/config/constants'
import { useAssetTracking } from '@/hooks/useAssetTracking'
import { useCalibrationModels } from '@/hooks/useCalibration'
import { useReceiverStatus } from '@/hooks/useReceiverStatus'
import { useRoomConfiguration, useZones } from '@/hooks/useRoomConfiguration'
import { LINK_DESCRIPTION, LINK_LABEL } from '@/utils/receivers'
import { formatDbm, rssiToUnit } from '@/utils/signal'
import { formatAge, formatDateTime } from '@/utils/time'

export default function Devices() {
  const { receivers } = useReceiverStatus()
  const { config } = useRoomConfiguration()
  const { zones } = useZones(config)
  const models = useCalibrationModels()
  const { asset, view, now } = useAssetTracking()

  return (
    <div className="space-y-3 p-3 md:p-4">
      <Callout tone="info" title="How receiver status is determined">
        The backend reports beacon observation timestamps, not device heartbeats. A receiver is <b>Online</b> if it observed the beacon within{' '}
        {RECEIVER_STALE_MS / 1000}s, <b>No recent observations</b> up to {RECEIVER_OFFLINE_MS / 1000}s, and <b>Offline</b> beyond that or if never observed this session. A missing
        observation does not prove an ESP32 is powered off.
      </Callout>

      <div className="grid gap-3 lg:grid-cols-3">
        {receivers.map((r) => {
          const model = models.data?.models[r.id]
          const zone = zones.find((z) => z.receiverId === r.id)
          const obs = r.observation
          return (
            <Card key={r.id}>
              <CardHeader
                icon={<Cpu />}
                title={
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: r.color }} />
                    {r.label}
                  </span>
                }
                description={<span className="font-mono">{r.id}</span>}
                actions={
                  <div className="flex gap-1">
                    <Badge tone={r.configured ? 'info' : 'muted'}>{r.configured ? 'Configured' : 'Unconfigured'}</Badge>
                    <Badge tone={linkTone[r.link]}>{LINK_LABEL[r.link]}</Badge>
                  </div>
                }
              />
              <CardBody className="space-y-3">
                <p className="text-[11px] text-muted">{LINK_DESCRIPTION[r.link]}</p>
                <div>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-[11px] text-muted">Last RSSI</span>
                    <span className="font-mono text-xl font-semibold tabular">{formatDbm(obs?.rssi ?? null)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full" style={{ width: `${rssiToUnit(r.link === 'online' ? (obs?.rssi ?? null) : null) * 100}%`, background: r.color }} />
                  </div>
                </div>
                <dl>
                  <KeyValue label="Position (x, y, z)" value={r.position ? `${r.position.x.toFixed(2)}, ${r.position.y.toFixed(2)}, ${r.position.z.toFixed(2)} m` : '—'} />
                  <KeyValue label="Filtered RSSI" value={formatDbm(obs?.filteredRssi ?? null, 1)} />
                  <KeyValue label="Packets" value={obs?.packets ?? '—'} />
                  <KeyValue label="Last seen" value={r.lastSeen ? `${formatDateTime(r.lastSeen)} · ${formatAge(r.ageMs)}` : 'Not observed this session'} />
                  <KeyValue
                    label="Associated zone"
                    value={zone?.polygon ? `${RECEIVER_META[r.id].zone} · ${zone.area.toFixed(1)} m²` : zone?.ambiguous ? 'Ambiguous (shared XY)' : '—'}
                  />
                  <KeyValue
                    label="Calibration"
                    value={
                      models.isPending ? '…' : model ? (
                        <span className="font-mono text-xs">
                          P0 {model.p0?.toFixed(1) ?? '—'} · n {model.n?.toFixed(2) ?? '—'}
                        </span>
                      ) : (
                        <Badge tone="warn">Not calibrated</Badge>
                      )
                    }
                  />
                </dl>
                {r.id === 'esp32-c' && r.link !== 'online' && (
                  <Callout tone="warn">ESP32 C hardware is planned. Its configured position is used for zones; it will report automatically once deployed.</Callout>
                )}
              </CardBody>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader icon={<Tag />} title="Tracked asset" description="BLE beacon — tracked by receivers, not an AWS-connected device" />
        <CardBody className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          <dl>
            <KeyValue label="Name" value={BEACON.name} />
            <KeyValue label="Model" value={BEACON.model} />
            <KeyValue label="MAC" value={asset?.beaconId ?? BEACON.mac} mono />
          </dl>
          <dl>
            <KeyValue label="Advertising interval" value={`~${BEACON.advertisingIntervalMs} ms`} />
            <KeyValue label="Type" value="Non-connectable tag" />
            <KeyValue label="Asset ID" value={asset?.assetId ?? '—'} mono />
          </dl>
          <dl>
            <KeyValue label="Localization" value={<Badge tone={view.tone === 'muted' ? 'muted' : view.tone}>{view.label}</Badge>} />
            <KeyValue label="Heard by" value={`${receivers.filter((r) => r.link === 'online').length} receiver(s)`} />
            <KeyValue label="Last estimate" value={asset?.updatedAt ? formatAge(now - asset.updatedAt) : '—'} />
          </dl>
        </CardBody>
      </Card>
      <p className="flex items-center gap-1.5 text-[11px] text-subtle">
        <Radio className="size-3" /> Receivers publish RSSI telemetry to AWS IoT Core over MQTT/TLS; this dashboard reads it through API Gateway.
      </p>
    </div>
  )
}
