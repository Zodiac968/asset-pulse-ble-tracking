import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      tone: {
        ok: 'bg-ok/12 text-ok ring-1 ring-ok/30 ring-inset',
        warn: 'bg-warn/12 text-warn ring-1 ring-warn/30 ring-inset',
        danger: 'bg-danger/12 text-danger ring-1 ring-danger/30 ring-inset',
        info: 'bg-accent/12 text-accent ring-1 ring-accent/30 ring-inset',
        muted: 'bg-panel-raised text-muted ring-1 ring-border-strong ring-inset',
        demo: 'bg-[#f472b6]/15 text-[#f9a8d4] ring-1 ring-[#f472b6]/40 ring-inset',
      },
    },
    defaultVariants: { tone: 'muted' },
  },
)

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

export function StatusDot({ tone, pulse }: { tone: 'ok' | 'warn' | 'danger' | 'info' | 'muted'; pulse?: boolean }) {
  const color = {
    ok: 'bg-ok',
    warn: 'bg-warn',
    danger: 'bg-danger',
    info: 'bg-accent',
    muted: 'bg-subtle',
  }[tone]
  return (
    <span className="relative inline-flex size-2 shrink-0" aria-hidden>
      {pulse && <span className={cn('absolute inset-0 rounded-full animate-pulse-ring', color)} />}
      <span className={cn('relative inline-flex size-2 rounded-full', color)} />
    </span>
  )
}
