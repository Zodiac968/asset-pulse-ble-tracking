import { useState } from 'react'
import { Cloud, FlaskConical, Map as MapIcon, Radio, RefreshCw } from 'lucide-react'
import { useSession } from '@/components/auth/SessionProvider'
import { DemoControls } from '@/components/dashboard/DemoControls'
import { RoomConfigPanel } from '@/components/room/RoomControls'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { NumberField, Select } from '@/components/ui/form'
import { Callout, KeyValue } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { Switch } from '@/components/ui/switch'
import { RECEIVER_META, REFRESH_INTERVAL_OPTIONS } from '@/config/constants'
import { env, isLiveConfigured, missingLiveConfig } from '@/config/env'
import { useAssetTracking } from '@/hooks/useAssetTracking'
import { useHealth } from '@/hooks/useHealth'
import { useReceiverStatus } from '@/hooks/useReceiverStatus'
import { useRoomEditing } from '@/hooks/useRoomEditing'
import { useModeStore } from '@/stores/modeStore'
import { useRoomDraftStore } from '@/stores/roomDraftStore'
import { useUiStore } from '@/stores/uiStore'
import { RECEIVER_IDS } from '@/types/room'
import { LINK_LABEL } from '@/utils/receivers'
import { formatAge } from '@/utils/time'

function ReceiverTable() {
  const e = useRoomEditing()
  const update = useRoomDraftStore((s) => s.updateReceiver)
  const { receivers } = useReceiverStatus()
  return (
    <Card>
      <CardHeader icon={<Radio />} title="Receiver coordinates" description="All three positions are always sent to PUT /config, even when a receiver is offline." />
      <CardBody className="space-y-3">
        {RECEIVER_IDS.map((id) => {
          const p = e.config.receivers[id]
          const v = receivers.find((r) => r.id === id)
          return (
            <div key={id} className="grid grid-cols-[100px_repeat(3,minmax(0,1fr))] items-end gap-2">
              <div className="pb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="size-2 rounded-full" style={{ background: RECEIVER_META[id].color }} />
                  {RECEIVER_META[id].label}
                </div>
                <div className="text-[10px] text-subtle">{v ? LINK_LABEL[v.link] : ''}</div>
              </div>
              {(['x', 'y', 'z'] as const).map((axis) => (
                <NumberField key={axis} compact label={axis.toUpperCase()} unit="m" step={0.05} value={p[axis]} disabled={!e.editing} onCommit={(n) => update(id, { [axis]: n })} />
              ))}
            </div>
          )
        })}
        {!e.editing && <p className="text-[11px] text-subtle">Press “Edit layout” in Room configuration to change coordinates.</p>}
      </CardBody>
    </Card>
  )
}

export default function Settings() {
  const ui = useUiStore()
  const session = useSession()
  const setMode = useModeStore((s) => s.setMode)
  const health = useHealth()
  const { lastSuccess, now, error } = useAssetTracking()
  const [confirmMode, setConfirmMode] = useState<null | 'live' | 'demo'>(null)

  return (
    <div className="grid gap-3 p-3 md:p-4 xl:grid-cols-2">
      <div className="space-y-3">
        <RoomConfigPanel />
        <ReceiverTable />
      </div>
      <div className="space-y-3">
        <Card>
          <CardHeader icon={<MapIcon />} title="Map & tracking preferences" description="Stored in this browser" />
          <CardBody className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px]">Default map view</span>
              <Select aria-label="Default map view" value={ui.defaultView} onChange={(e) => ui.set({ defaultView: e.target.value as '2d' | '3d' })}>
                <option value="2d">2D</option>
                <option value="3d">3D</option>
              </Select>
            </div>
            <Switch label="Voronoi zones" checked={ui.showZones} onCheckedChange={(v) => ui.set({ showZones: v })} />
            <Switch label="Grid" checked={ui.showGrid} onCheckedChange={(v) => ui.set({ showGrid: v })} />
            <Switch label="Estimated range circles" description="Model-derived estimates, not measurements" checked={ui.showCircles} onCheckedChange={(v) => ui.set({ showCircles: v })} />
            <Switch label="Movement trail" checked={ui.showTrail} onCheckedChange={(v) => ui.set({ showTrail: v })} />
            <div className="flex items-center justify-between">
              <span className="text-[13px]">Tracking refresh interval</span>
              <Select aria-label="Tracking refresh interval" value={ui.refreshMs} onChange={(e) => ui.set({ refreshMs: Number(e.target.value) })}>
                {REFRESH_INTERVAL_OPTIONS.map((ms) => (
                  <option key={ms} value={ms}>
                    {ms / 1000} s
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end justify-between gap-3">
              <span className="pb-1.5 text-[13px]">Snap step</span>
              <NumberField compact label="metres" value={ui.snapStep} step={0.05} min={0.01} onCommit={(v) => v > 0 && ui.set({ snapStep: v })} className="w-24" />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<Cloud />} title="AWS API connection" actions={<Badge tone={session.mode === 'demo' ? 'demo' : health.isSuccess && !error ? 'ok' : 'danger'}>{session.mode === 'demo' ? 'Demo' : health.isSuccess && !error ? 'Connected' : 'Not connected'}</Badge>} />
          <CardBody className="space-y-2.5">
            <dl>
              <KeyValue label="Region" value={env.region} mono />
              <KeyValue label="API base URL" value={env.apiBaseUrl || 'not configured'} mono />
              <KeyValue label="Cognito domain" value={env.cognitoDomain || 'not configured'} mono />
              <KeyValue label="Callback URL" value={env.redirectUri} mono />
              <KeyValue label="Data source" value={session.mode === 'demo' ? 'Demo simulator' : 'API Gateway (live)'} />
              <KeyValue label="Health check" value={health.isPending ? 'checking…' : health.isError ? health.error.message : health.data?.ok ? 'OK' : 'Reported unhealthy'} />
              <KeyValue label="Last /asset success" value={lastSuccess ? formatAge(now - lastSuccess) : '—'} />
              <KeyValue label="Granted scopes" value={session.scopes.join(' ') || '—'} mono />
            </dl>
            {error && <Callout tone="danger" title="Latest tracking request failed">{error.message}</Callout>}
            <Button size="sm" variant="ghost" onClick={() => void health.refetch()}>
              <RefreshCw className={health.isFetching ? 'animate-spin' : undefined} /> Check health
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<FlaskConical />} title="Data mode" description="Live and demo data are never mixed; switching clears session history." />
          <CardBody className="space-y-2.5">
            <div className="flex flex-wrap gap-2">
              <Button variant={session.mode === 'live' ? 'primary' : 'secondary'} size="sm" disabled={session.mode === 'live' || !isLiveConfigured} onClick={() => setConfirmMode('live')}>
                Live (AWS)
              </Button>
              <Button variant={session.mode === 'demo' ? 'primary' : 'secondary'} size="sm" disabled={session.mode === 'demo'} onClick={() => setConfirmMode('demo')}>
                Demo Mode
              </Button>
            </div>
            {!isLiveConfigured && <Callout tone="warn" title="Live mode not configured">Missing: {missingLiveConfig.join(', ')}. See .env.example.</Callout>}
          </CardBody>
        </Card>
        <DemoControls />
      </div>

      <Dialog
        open={confirmMode !== null}
        onOpenChange={(o) => !o && setConfirmMode(null)}
        title={confirmMode === 'demo' ? 'Switch to Demo Mode?' : 'Switch to Live mode?'}
        description={
          confirmMode === 'demo'
            ? 'All data will come from the built-in simulator and will be clearly labeled as simulated. Session history is cleared.'
            : 'You will sign in with Cognito and all data will come from API Gateway. Session history is cleared.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmMode(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const m = confirmMode
                setConfirmMode(null)
                setMode(m)
              }}
            >
              Switch
            </Button>
          </>
        }
      />
    </div>
  )
}
