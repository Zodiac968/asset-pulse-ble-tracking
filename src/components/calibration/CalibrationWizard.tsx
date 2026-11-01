import { useMemo, useState } from 'react'
import { Check, Crosshair, FlaskConical, ListChecks, MapPin, Play, PlayCircle, Sigma, Square, Upload, X } from 'lucide-react'
import { CALIBRATION, RECEIVER_META } from '@/config/constants'
import { useCalibration } from '@/hooks/useCalibration'
import { useMapData } from '@/hooks/useMapData'
import { useNow } from '@/hooks/useNow'
import { useUiStore } from '@/stores/uiStore'
import { RECEIVER_IDS } from '@/types/room'
import { modelWarnings, pointCoverageWarnings } from '@/utils/calibrationQuality'
import { clamp, isInsideRoom } from '@/utils/coordinates'
import { LINK_LABEL } from '@/utils/receivers'
import { formatAge, formatClock, formatDuration } from '@/utils/time'
import { cn } from '@/utils/cn'
import { useSession } from '../auth/SessionProvider'
import { RoomMap2D } from '../room/RoomMap2D'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardBody, CardHeader } from '../ui/card'
import { NumberField, Progress } from '../ui/form'
import { Callout, EmptyState, KeyValue } from '../ui/misc'
import { Dialog, Tooltip } from '../ui/overlay'
import { FitChart } from './FitChart'
import { ModelsTable } from './ModelsTable'

const STEPS = ['Start session', 'Known position', 'Collect samples', 'Stop sampling', 'Repeat positions', 'Fit models', 'Apply'] as const

function Stepper({ current, done }: { current: number; done: boolean }) {
  return (
    <ol className="scrollbar-thin flex gap-1 overflow-x-auto" aria-label="Calibration steps">
      {STEPS.map((s, i) => {
        const state = done || i < current ? 'done' : i === current ? 'current' : 'todo'
        return (
          <li
            key={s}
            aria-current={state === 'current' ? 'step' : undefined}
            className={cn(
              'flex min-w-max flex-1 items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs',
              state === 'current' && 'border-accent/50 bg-accent/10 text-foreground',
              state === 'done' && 'border-border bg-panel text-muted',
              state === 'todo' && 'border-border bg-panel text-subtle',
            )}
          >
            <span
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold',
                state === 'done' ? 'bg-ok/20 text-ok' : state === 'current' ? 'bg-accent text-accent-foreground' : 'bg-panel-raised text-subtle',
              )}
            >
              {state === 'done' ? <Check className="size-3" /> : i + 1}
            </span>
            {s}
          </li>
        )
      })}
    </ol>
  )
}

export function CalibrationWizard() {
  const cal = useCalibration()
  const map = useMapData()
  const { canWrite, mode } = useSession()
  const ui = useUiStore()
  const now = useNow()
  const [confirmApply, setConfirmApply] = useState(false)
  const { target, setTarget, fit, apply, localSampling } = cal.store
  const room = map.config

  const sessionActive = Boolean(cal.session || cal.sessionId)
  const busy = cal.start.isPending || cal.samplePoint.isPending || cal.stop.isPending || cal.fit.isPending || cal.apply.isPending
  const completed = cal.completed
  const fitModels = fit?.models ?? {}

  const step = !sessionActive
    ? 0
    : cal.isSampling
      ? 3
      : apply
        ? 7
        : fit
          ? 6
          : completed.length >= 3
            ? 5
            : target
              ? 2
              : completed.length > 0
                ? 4
                : 1

  const receiverC = map.receivers.find((r) => r.id === 'esp32-c')
  const missingReceivers = map.receivers.filter((r) => r.link !== 'online')

  const warnings = useMemo(
    () => [...pointCoverageWarnings(completed, room), ...(fit ? modelWarnings(fit.models, completed) : [])],
    [completed, room, fit],
  )

  const active = cal.activePoint
  const startedAt = localSampling?.startedAt ?? null
  const expiresAt = localSampling?.expiresAt ?? null
  const elapsed = startedAt ? now - startedAt : 0
  // The status endpoint has no per-sample timestamps; show the newest beacon observation from GET /asset.
  const lastObs = Math.max(0, ...map.receivers.map((r) => r.lastSeen ?? 0)) || null

  const targetValid = target && isInsideRoom(target, room.width, room.length)
  const canSample = canWrite && sessionActive && !cal.isSampling && Boolean(targetValid) && !busy

  const writeHint = !canWrite ? 'Requires the asset-tracker/write scope' : undefined

  return (
    <div className="space-y-3">
      <Stepper current={Math.min(step, 6)} done={step === 7} />

      {(receiverC?.link !== 'online' || missingReceivers.length > 0) && (
        <Callout tone="warn" title={receiverC?.link !== 'online' ? 'ESP32 C is not reporting' : 'Not all receivers are reporting'}>
          {missingReceivers.map((r) => `${r.label}: ${LINK_LABEL[r.link]}`).join(' · ')}. You can still collect real samples from the receivers that are online, but the backend requires valid models for
          all three receivers to fit/apply a full localization calibration. If it rejects the fit or apply step, its error is shown exactly as returned. No samples are fabricated.
        </Callout>
      )}

      <div className="grid gap-3 xl:grid-cols-12">
        <Card className="flex flex-col xl:col-span-7">
          <CardHeader
            icon={<Crosshair />}
            title="Known beacon position"
            description="Click inside the room to place the calibration marker, or type coordinates. The yellow marker is the true position you will physically place the beacon at — not an estimate."
            actions={mode === 'demo' ? <Badge tone="demo">Simulated</Badge> : undefined}
          />
          <div className="h-[clamp(320px,52vh,560px)] p-2">
            <RoomMap2D
              config={room}
              zones={map.zones}
              receivers={map.receivers}
              asset={map.asset}
              activeZoneId={map.activeZoneId}
              selection={ui.selection}
              onSelect={ui.setSelection}
              showGrid={ui.showGrid}
              showZones={ui.showZones}
              calibration={{ target, points: cal.points, activePointId: cal.isSampling ? (active?.pointId ?? localSampling?.pointId ?? null) : null }}
              onPick={cal.isSampling ? undefined : (p) => setTarget(p)}
              pickLabel="Click to set the known position"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t border-border px-4 py-3">
            <NumberField label="Known X" unit="m" value={target?.x ?? 0} min={0} max={room.width} step={0.05} disabled={cal.isSampling} onCommit={(x) => setTarget({ x: clamp(x, 0, room.width), y: target?.y ?? 0 })} className="w-28" />
            <NumberField label="Known Y" unit="m" value={target?.y ?? 0} min={0} max={room.length} step={0.05} disabled={cal.isSampling} onCommit={(y) => setTarget({ x: target?.x ?? 0, y: clamp(y, 0, room.length) })} className="w-28" />
            {target && !cal.isSampling && (
              <Button size="sm" variant="ghost" onClick={() => setTarget(null)}>
                <X /> Clear
              </Button>
            )}
            <span className="ml-auto text-[11px] text-subtle">Room {room.width} × {room.length} m · recommend ≥ {CALIBRATION.recommendedPoints} spread-out positions</span>
          </div>
        </Card>

        <div className="space-y-3 xl:col-span-5">
          <Card>
            <CardHeader icon={<FlaskConical />} title="Session" actions={sessionActive ? <Badge tone="info">{cal.session?.status ?? 'active'}</Badge> : <Badge tone="muted">None</Badge>} />
            <CardBody className="space-y-2.5 py-3">
              {cal.statusQuery.isError && <Callout tone="danger" title="GET /calibration/status failed">{cal.statusQuery.error.message}</Callout>}
              <dl>
                <KeyValue label="Session ID" value={cal.sessionId ?? '—'} mono />
                <KeyValue label="Started" value={cal.session?.createdAt ? formatClock(cal.session.createdAt) : '—'} />
                <KeyValue label="Completed positions" value={completed.length} />
              </dl>
              <Tooltip content={writeHint}>
                <span className="block">
                  <Button variant={sessionActive ? 'secondary' : 'primary'} size="sm" className="w-full" disabled={!canWrite || busy || cal.isSampling} onClick={() => cal.start.mutate()}>
                    <PlayCircle /> {cal.start.isPending ? 'Starting…' : sessionActive ? 'Start new session' : 'Start calibration'}
                  </Button>
                </span>
              </Tooltip>
              {sessionActive && <p className="text-[11px] text-subtle">A new session starts a fresh set of positions; the backend decides what happens to the previous one.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              icon={<Play />}
              title="Sampling"
              actions={cal.isSampling ? <Badge tone="ok">Sampling</Badge> : <Badge tone="muted">Idle</Badge>}
              description={cal.isSampling ? 'The backend collects RSSI until you stop or until its expires_at deadline.' : 'Place the beacon at the known position, then start sampling.'}
            />
            <CardBody className="space-y-3 py-3">
              {cal.isSampling ? (
                <>
                  <dl>
                    <KeyValue label="Position" value={active ? `${active.label} (${active.x.toFixed(2)}, ${active.y.toFixed(2)}) m` : localSampling ? `(${localSampling.x.toFixed(2)}, ${localSampling.y.toFixed(2)}) m` : '—'} />
                    <KeyValue label="Elapsed" value={formatDuration(elapsed)} />
                    <KeyValue label="Backend window ends" value={expiresAt ? `${formatClock(expiresAt)} (${formatDuration(expiresAt - now)} left)` : 'Not reported'} />
                    <KeyValue label="Last beacon observation" value={lastObs ? `${formatClock(lastObs)} (${formatAge(now - lastObs)})` : 'None this session'} />
                  </dl>
                  <div className="space-y-2">
                    {RECEIVER_IDS.map((id) => {
                      const n = active?.counts[id] ?? 0
                      const frac = n / CALIBRATION.recommendedSamplesPerReceiver
                      return (
                        <div key={id}>
                          <div className="mb-1 flex justify-between text-[11px]">
                            <span className="flex items-center gap-1.5 text-foreground">
                              <span className="size-2 rounded-full" style={{ background: RECEIVER_META[id].color }} />
                              {RECEIVER_META[id].label}
                            </span>
                            <span className="font-mono text-muted tabular">
                              {active ? n : '—'} / {CALIBRATION.recommendedSamplesPerReceiver} recommended
                            </span>
                          </div>
                          <Progress value={frac} tone={n === 0 ? 'danger' : frac >= 1 ? 'ok' : 'info'} />
                        </div>
                      )
                    })}
                  </div>
                  {!active && <p className="text-[11px] text-subtle">The status endpoint has not reported this point's sample counts yet.</p>}
                  <Button variant="danger" size="sm" className="w-full" disabled={busy || !canWrite} onClick={() => cal.stop.mutate()}>
                    <Square /> {cal.stop.isPending ? 'Stopping…' : 'Stop sampling'}
                  </Button>
                </>
              ) : (
                <>
                  {!sessionActive && <p className="text-xs text-muted">Start a calibration session first.</p>}
                  {sessionActive && !target && <p className="text-xs text-muted">Choose the known position on the map or enter X/Y.</p>}
                  {target && !targetValid && <Callout tone="danger">The known position must lie inside the room.</Callout>}
                  <Tooltip content={writeHint}>
                    <span className="block">
                      <Button variant="primary" size="sm" className="w-full" disabled={!canSample} onClick={() => target && cal.samplePoint.mutate(target)}>
                        <MapPin /> {cal.samplePoint.isPending ? 'Requesting…' : target ? `Start sampling at (${target.x.toFixed(2)}, ${target.y.toFixed(2)})` : 'Start sampling'}
                      </Button>
                    </span>
                  </Tooltip>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<ListChecks />} title="Completed positions" actions={<span className="text-[11px] text-muted tabular">{completed.length}/{CALIBRATION.recommendedPoints} recommended</span>} />
            {completed.length === 0 ? (
              <EmptyState title="No completed positions yet" />
            ) : (
              <div className="scrollbar-thin max-h-56 overflow-auto px-4 py-2">
                <table className="w-full text-xs tabular">
                  <thead className="text-left text-[11px] text-muted">
                    <tr>
                      <th className="py-1 font-medium">Point</th>
                      <th className="py-1 font-medium">X, Y (m)</th>
                      {RECEIVER_IDS.map((id) => (
                        <th key={id} className="py-1 text-right font-medium">
                          {RECEIVER_META[id].short}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {completed.map((p) => (
                      <tr key={p.pointId} className="border-t border-border">
                        <td className="py-1 text-calibration" title={p.pointId}>{p.label}</td>
                        <td className="py-1">
                          {p.x.toFixed(2)}, {p.y.toFixed(2)}
                        </td>
                        {RECEIVER_IDS.map((id) => {
                          const n = p.counts[id] ?? 0
                          return (
                            <td key={id} className={cn('py-1 text-right', n === 0 ? 'text-danger' : n < CALIBRATION.backendMinSamplesPerPoint ? 'text-warn' : 'text-foreground')}>
                              {n}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          icon={<Sigma />}
          title="Fit & apply"
          description="Collected measurements → fitted model (POST /calibration/fit) → activated model (POST /calibration/apply, confirmed by backend)."
          actions={
            <div className="flex gap-1.5">
              <Badge tone={completed.length > 0 ? 'info' : 'muted'}>1 · Measurements {completed.length}</Badge>
              <Badge tone={fit ? (fit.allValid ? 'ok' : 'warn') : 'muted'}>2 · Fitted {fit ? (fit.allValid ? 'valid' : 'not valid') : '—'}</Badge>
              <Badge tone={apply ? 'ok' : 'muted'}>3 · Activated {apply ? '✓' : '—'}</Badge>
            </div>
          }
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip content={writeHint}>
              <span>
                <Button variant={fit ? 'secondary' : 'primary'} size="sm" disabled={!canWrite || !sessionActive || cal.isSampling || busy || completed.length < CALIBRATION.minFitPoints} onClick={() => cal.fit.mutate()}>
                  <Sigma /> {cal.fit.isPending ? 'Fitting…' : fit ? 'Re-fit models' : 'Fit calibration models'}
                </Button>
              </span>
            </Tooltip>
            <Tooltip content={!fit ? 'Fit models first' : !fit.allValid ? 'All three receivers need models that pass backend validation' : writeHint}>
              <span>
                <Button variant="primary" size="sm" disabled={!canWrite || !fit || !fit.allValid || busy || !cal.sessionId || Boolean(apply)} onClick={() => setConfirmApply(true)}>
                  <Upload /> {cal.apply.isPending ? 'Applying…' : 'Apply calibration'}
                </Button>
              </span>
            </Tooltip>
            {fit && !apply && (
              <Button variant="ghost" size="sm" onClick={() => cal.store.setFit(null)} disabled={busy}>
                <X /> Discard fit result
              </Button>
            )}
            {completed.length < CALIBRATION.minFitPoints && <span className="text-[11px] text-subtle">The backend needs at least {CALIBRATION.minFitPoints} positions to fit.</span>}
          </div>

          {apply && (
            <Callout tone="info" title={`Calibration activated · ${formatClock(apply.at)}`}>
              The backend confirmed activation for session {apply.sessionId}.{apply.result.message ? ` ${apply.result.message}` : ''}
            </Callout>
          )}
          {cal.apply.isError && <Callout tone="danger" title="Activation rejected by backend">{cal.apply.error.message}</Callout>}
          {cal.fit.isError && <Callout tone="danger" title="Fit rejected by backend">{cal.fit.error.message}</Callout>}
          {fit?.message && <Callout tone={fit.allValid ? 'info' : 'warn'}>Backend: {fit.message}</Callout>}
          {fit && !fit.allValid && !apply && (
            <Callout tone="warn" title="Models not activated">
              One or more receiver models did not pass validation, so this calibration cannot be applied. Nothing has been changed on the backend.
            </Callout>
          )}

          {warnings.length > 0 && (
            <ul className="space-y-1">
              {warnings.map((w, i) => (
                <li key={i} className={cn('flex gap-2 text-xs', w.severity === 'danger' ? 'text-danger' : 'text-warn')}>
                  <span aria-hidden>•</span>
                  <span>{w.message}</span>
                </li>
              ))}
            </ul>
          )}

          {fit ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <ModelsTable models={fitModels} />
              <FitChart models={fitModels} />
            </div>
          ) : (
            <p className="text-xs text-muted">No fitted models in this view yet. Fit results appear here exactly as returned by the API.</p>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={confirmApply}
        onOpenChange={setConfirmApply}
        title="Activate these calibration models?"
        description="The backend will use the fitted P0 and n values for every future localization. Success is shown only after the API confirms."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmApply(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirmApply(false)
                if (cal.sessionId) cal.apply.mutate(cal.sessionId)
              }}
            >
              <Upload /> Apply
            </Button>
          </>
        }
      />
    </div>
  )
}
