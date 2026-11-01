import { useState } from 'react'
import { Lock, Pencil, RefreshCw, Ruler, Save, Undo2 } from 'lucide-react'
import { RECEIVER_META, ROOM_LIMITS } from '@/config/constants'
import { useRoomEditing } from '@/hooks/useRoomEditing'
import { useRoomDraftStore } from '@/stores/roomDraftStore'
import { useUiStore } from '@/stores/uiStore'
import { RECEIVER_IDS, type ReceiverId } from '@/types/room'
import type { ReceiverView } from '@/types/tracking'
import { LINK_LABEL } from '@/utils/receivers'
import { formatDateTime } from '@/utils/time'
import { cn } from '@/utils/cn'
import { Badge, StatusDot } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardBody, CardHeader } from '../ui/card'
import { NumberField, Select } from '../ui/form'
import { Callout } from '../ui/misc'
import { Dialog, Tooltip } from '../ui/overlay'
import { Switch } from '../ui/switch'

export function ConfigStateBadge() {
  const { editing, dirty, usingDefaults, query } = useRoomEditing()
  if (query.isPending) return <Badge tone="muted">Loading…</Badge>
  if (editing && dirty) return <Badge tone="warn">Editing · unsaved changes</Badge>
  if (editing) return <Badge tone="info">Editing · no changes</Badge>
  if (usingDefaults) return <Badge tone="danger">Not loaded · defaults shown</Badge>
  return <Badge tone="ok">Saved</Badge>
}

/** Edit/Live toggle with discard confirmation. */
export function EditModeToggle({ compact }: { compact?: boolean }) {
  const e = useRoomEditing()
  const [confirm, setConfirm] = useState(false)
  const exit = () => (e.dirty ? setConfirm(true) : e.discardEdits())
  return (
    <>
      <div role="radiogroup" aria-label="Map mode" className="inline-flex rounded-md border border-border-strong bg-surface p-0.5">
        <button
          type="button"
          role="radio"
          aria-checked={!e.editing}
          onClick={() => e.editing && exit()}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium [&_svg]:size-3.5',
            !e.editing ? 'bg-panel-raised text-foreground ring-1 ring-border-strong' : 'text-muted hover:text-foreground',
          )}
        >
          <Lock /> {compact ? 'Live' : 'Live mode'}
        </button>
        <Tooltip content={!e.canWrite ? 'Requires the asset-tracker/write scope' : undefined}>
          <span>
            <button
              type="button"
              role="radio"
              aria-checked={e.editing}
              disabled={!e.canWrite}
              onClick={() => !e.editing && e.startEditing()}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium disabled:opacity-40 [&_svg]:size-3.5',
                e.editing ? 'bg-accent/15 text-accent ring-1 ring-accent/40' : 'text-muted hover:text-foreground',
              )}
            >
              <Pencil /> {compact ? 'Edit' : 'Edit mode'}
            </button>
          </span>
        </Tooltip>
      </div>
      <DiscardDialog open={confirm} onOpenChange={setConfirm} onDiscard={e.discardEdits} />
    </>
  )
}

function DiscardDialog({ open, onOpenChange, onDiscard }: { open: boolean; onOpenChange: (o: boolean) => void; onDiscard: () => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Discard unsaved layout changes?"
      description="Room dimensions or receiver positions were changed but not saved to the backend. Discarding restores the saved configuration."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep editing
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onDiscard()
              onOpenChange(false)
            }}
          >
            Discard changes
          </Button>
        </>
      }
    />
  )
}

export function SaveBar() {
  const e = useRoomEditing()
  const [confirm, setConfirm] = useState(false)
  if (!e.editing) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" size="sm" onClick={e.save} disabled={!e.canSave}>
        <Save /> {e.saving ? 'Saving…' : 'Save configuration'}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => (e.dirty ? setConfirm(true) : e.discardEdits())} disabled={e.saving}>
        <Undo2 /> {e.dirty ? 'Discard' : 'Done'}
      </Button>
      <DiscardDialog open={confirm} onOpenChange={setConfirm} onDiscard={e.discardEdits} />
    </div>
  )
}

export function RoomConfigPanel({ className }: { className?: string }) {
  const e = useRoomEditing()
  const updateDimensions = useRoomDraftStore((s) => s.updateDimensions)
  const ui = useUiStore()
  const { config, editing } = e
  const fieldError = (f: string) => e.errors.some((i) => i.field === f)

  return (
    <Card className={className}>
      <CardHeader
        icon={<Ruler />}
        title="Room configuration"
        description={e.savedAt ? `Backend config updated ${formatDateTime(e.savedAt)}` : 'Dimensions in metres; origin at a room corner'}
        actions={<ConfigStateBadge />}
      />
      <CardBody className="space-y-3">
        {e.query.isError && (
          <Callout tone="danger" title="Could not load GET /config">
            {e.query.error.message} The map shows default dimensions, which are not the backend configuration.
          </Callout>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <NumberField label="Width (X)" unit="m" value={config.width} min={ROOM_LIMITS.minSide} max={ROOM_LIMITS.maxSide} disabled={!editing} invalid={fieldError('width')} onCommit={(v) => updateDimensions({ width: v })} />
          <NumberField label="Length (Y)" unit="m" value={config.length} min={ROOM_LIMITS.minSide} max={ROOM_LIMITS.maxSide} disabled={!editing} invalid={fieldError('length')} onCommit={(v) => updateDimensions({ length: v })} />
          <NumberField label="Height (Z)" unit="m" value={config.height} min={ROOM_LIMITS.minHeight} max={ROOM_LIMITS.maxHeight} disabled={!editing} invalid={fieldError('height')} onCommit={(v) => updateDimensions({ height: v })} />
          <NumberField
            label="Asset height"
            unit="m"
            value={config.asset_height}
            min={0}
            disabled={!editing}
            invalid={fieldError('asset_height')}
            onCommit={(v) => updateDimensions({ asset_height: v })}
            hint="Assumed, not measured"
          />
        </div>

        <div className="space-y-2 rounded-md border border-border bg-surface/60 p-2.5">
          <Switch label="Show grid" checked={ui.showGrid} onCheckedChange={(v) => ui.set({ showGrid: v })} />
          <Switch label="Snap to grid" description="Applies while dragging receivers" checked={ui.snapToGrid} onCheckedChange={(v) => ui.set({ snapToGrid: v })} />
          {ui.snapToGrid && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-foreground">Snap step</span>
              <Select aria-label="Snap step" value={ui.snapStep} onChange={(ev) => ui.set({ snapStep: Number(ev.target.value) })}>
                {[0.05, 0.1, 0.25, 0.5, 1].map((s) => (
                  <option key={s} value={s}>
                    {s} m
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <ValidationList />

        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <SaveBar />
          ) : (
            <Tooltip content={!e.canWrite ? 'Requires the asset-tracker/write scope' : undefined}>
              <span>
                <Button size="sm" onClick={e.startEditing} disabled={!e.canWrite}>
                  <Pencil /> Edit layout
                </Button>
              </span>
            </Tooltip>
          )}
          <Button size="sm" variant="ghost" onClick={e.reload} disabled={e.saving || (editing && e.dirty)} aria-label="Reload configuration from backend">
            <RefreshCw className={cn(e.query.isFetching && 'animate-spin')} /> Reload
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

export function ValidationList() {
  const e = useRoomEditing()
  return (
    <>
      {e.errors.length > 0 && (
        <Callout tone="danger" title="Fix before saving">
          <ul className="list-disc pl-4">
            {e.errors.map((i) => (
              <li key={i.field + i.message}>{i.message}</li>
            ))}
          </ul>
        </Callout>
      )}
      {e.warnings.map((w) => (
        <Callout key={w.message} tone="warn">
          {w.message}
        </Callout>
      ))}
      {e.editing && e.moved && (
        <Callout tone="warn" title="Receiver positions changed">
          Moving physical receivers changes the RSSI–distance relationship. Recalibrate after saving.
        </Callout>
      )}
    </>
  )
}

/** XYZ editor for receivers. Shares the draft with map dragging. */
export function ReceiverEditor({ receivers, selectedId, onSelect, className }: { receivers: ReceiverView[]; selectedId: ReceiverId | null; onSelect: (id: ReceiverId) => void; className?: string }) {
  const e = useRoomEditing()
  const updateReceiver = useRoomDraftStore((s) => s.updateReceiver)
  const id = selectedId ?? 'esp32-a'
  const pos = e.config.receivers[id]
  const view = receivers.find((r) => r.id === id)
  const err = (axis: string) => e.errors.some((i) => i.field === `receivers.${id}` || i.field === `receivers.${id}.${axis}`)

  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex gap-1" role="tablist" aria-label="Receiver">
        {RECEIVER_IDS.map((rid) => {
          const v = receivers.find((r) => r.id === rid)
          return (
            <button
              key={rid}
              role="tab"
              type="button"
              aria-selected={rid === id}
              onClick={() => onSelect(rid)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium',
                rid === id ? 'border-border-strong bg-panel-raised text-foreground' : 'border-transparent text-muted hover:text-foreground',
              )}
            >
              <span className="size-2 rounded-full" style={{ background: RECEIVER_META[rid].color }} />
              {RECEIVER_META[rid].short}
              {v && <StatusDot tone={v.link === 'online' ? 'ok' : v.link === 'no_recent' ? 'warn' : 'danger'} />}
            </button>
          )
        })}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <NumberField
            key={axis}
            compact
            label={axis.toUpperCase()}
            unit="m"
            step={0.05}
            min={0}
            value={pos[axis]}
            disabled={!e.editing}
            invalid={err(axis)}
            onCommit={(v) => updateReceiver(id, { [axis]: v })}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span className="font-mono">{id}</span>
        <span>{view ? LINK_LABEL[view.link] : '—'}</span>
      </div>
      {!e.editing && <p className="text-[11px] text-subtle">Positions are locked in Live mode. Switch to Edit mode to move receivers.</p>}
    </div>
  )
}
