import { History } from 'lucide-react'
import { useHistoryStore } from '@/stores/historyStore'
import { formatClock } from '@/utils/time'
import { cn } from '@/utils/cn'
import { Badge } from '../ui/badge'
import { Card, CardHeader } from '../ui/card'
import { EmptyState } from '../ui/misc'

const toneColor = { info: 'bg-accent', ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger' }

export function EventFeed({ className, limit = 30 }: { className?: string; limit?: number }) {
  const events = useHistoryStore((s) => s.events)
  const list = events.slice(-limit).reverse()
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        icon={<History />}
        title={
          <>
            Recent events <Badge tone="muted">Session history</Badge>
          </>
        }
        description="Derived from state changes observed in this browser — not stored AWS events."
      />
      {list.length === 0 ? (
        <EmptyState icon={<History />} title="No events yet" />
      ) : (
        <ol className="scrollbar-thin max-h-72 flex-1 overflow-y-auto px-4 py-2" aria-live="polite">
          {list.map((e) => (
            <li key={e.id} className="flex gap-2.5 py-1 text-xs">
              <span className="w-14 shrink-0 font-mono text-[11px] text-subtle tabular">{formatClock(e.t)}</span>
              <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', toneColor[e.tone])} aria-hidden />
              <span className="min-w-0 text-foreground/90">{e.message}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
