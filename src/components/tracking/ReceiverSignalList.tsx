import { Radio } from 'lucide-react'
import { useReceiverStatus } from '@/hooks/useReceiverStatus'
import { useUiStore } from '@/stores/uiStore'
import type { ReceiverLink } from '@/types/tracking'
import { LINK_DESCRIPTION, LINK_LABEL } from '@/utils/receivers'
import { formatDbm, rssiToUnit } from '@/utils/signal'
import { formatAge } from '@/utils/time'
import { cn } from '@/utils/cn'
import { Badge } from '../ui/badge'
import { Card, CardHeader } from '../ui/card'
import { Tooltip } from '../ui/overlay'

export const linkTone: Record<ReceiverLink, 'ok' | 'warn' | 'danger' | 'muted'> = {
  online: 'ok',
  no_recent: 'warn',
  offline: 'danger',
  unconfigured: 'muted',
}

export function ReceiverSignalList() {
  const { receivers, onlineCount, total } = useReceiverStatus()
  const { selection, setSelection } = useUiStore()
  return (
    <Card>
      <CardHeader icon={<Radio />} title="Receivers" actions={<span className="text-[11px] text-muted tabular">{onlineCount}/{total} online</span>} />
      <ul className="divide-y divide-border">
        {receivers.map((r) => {
          const rssi = r.observation?.rssi ?? null
          const fresh = r.link === 'online'
          const selected = selection?.kind === 'receiver' && selection.id === r.id
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelection({ kind: 'receiver', id: r.id })}
                aria-pressed={selected}
                className={cn('w-full px-4 py-2 text-left transition-colors hover:bg-panel-raised/60', selected && 'bg-panel-raised/70')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[13px] font-medium">
                    <span className="size-2 rounded-full" style={{ background: r.color }} />
                    {r.label}
                    <span className="font-mono text-[11px] text-subtle">{r.id}</span>
                  </span>
                  <Tooltip content={LINK_DESCRIPTION[r.link]}>
                    <span>
                      <Badge tone={linkTone[r.link]}>{LINK_LABEL[r.link]}</Badge>
                    </span>
                  </Tooltip>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface" aria-hidden>
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${rssiToUnit(fresh ? rssi : null) * 100}%`, background: r.color, opacity: fresh ? 1 : 0.4 }} />
                  </div>
                  <span className={cn('w-16 text-right font-mono text-xs tabular', fresh ? 'text-foreground' : 'text-subtle')}>{formatDbm(rssi)}</span>
                </div>
                <div className="mt-0.5 flex justify-between text-[11px] text-subtle tabular">
                  <span>filtered {formatDbm(r.observation?.filteredRssi ?? null, 1)}</span>
                  <span>{r.lastSeen ? `seen ${formatAge(r.ageMs)}` : r.id === 'esp32-c' ? 'awaiting hardware' : 'not seen this session'}</span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
