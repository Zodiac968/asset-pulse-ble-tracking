import type { ReactNode } from 'react'
import { AlertTriangle, Info, OctagonAlert } from 'lucide-react'
import { cn } from '@/utils/cn'

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; icon?: ReactNode; disabled?: boolean }[]
  label: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-border-strong bg-surface p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[5px] font-medium transition-colors disabled:opacity-40 [&_svg]:size-3.5',
              size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-xs',
              active ? 'bg-panel-raised text-foreground shadow-sm ring-1 ring-border-strong' : 'text-muted hover:text-foreground',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Callout({
  tone = 'info',
  title,
  children,
  className,
  action,
}: {
  tone?: 'info' | 'warn' | 'danger'
  title?: ReactNode
  children?: ReactNode
  className?: string
  action?: ReactNode
}) {
  const Icon = tone === 'danger' ? OctagonAlert : tone === 'warn' ? AlertTriangle : Info
  const styles = {
    info: 'border-accent/25 bg-accent/[0.06] text-accent',
    warn: 'border-warn/30 bg-warn/[0.07] text-warn',
    danger: 'border-danger/30 bg-danger/[0.07] text-danger',
  }[tone]
  return (
    <div className={cn('flex gap-2.5 rounded-md border px-3 py-2', styles, className)} role={tone === 'info' ? 'note' : 'alert'}>
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0 flex-1 text-xs leading-relaxed">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className="text-foreground/80">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  )
}

export function KeyValue({ label, value, mono, className }: { label: ReactNode; value: ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1 text-[13px]', className)}>
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={cn('min-w-0 truncate text-right text-foreground tabular', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  )
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-8 text-center">
      {icon && <div className="text-subtle [&_svg]:size-5">{icon}</div>}
      <div className="text-[13px] font-medium text-foreground">{title}</div>
      {children && <div className="max-w-sm text-xs text-muted">{children}</div>}
    </div>
  )
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-1.5 text-[11px] font-semibold tracking-wider text-subtle uppercase', className)}>{children}</div>
}
