import { useId, type ReactNode } from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/utils/cn'

interface SwitchProps {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
  className?: string
}

export function Switch({ checked, onCheckedChange, label, description, disabled, className }: SwitchProps) {
  const id = useId()
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      {label && (
        <label htmlFor={id} className="min-w-0 cursor-pointer select-none">
          <span className="block text-[13px] text-foreground">{label}</span>
          {description && <span className="block text-[11px] text-muted">{description}</span>}
        </label>
      )}
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-border-strong bg-surface transition-colors data-[state=checked]:border-accent/60 data-[state=checked]:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <SwitchPrimitive.Thumb className="block size-3 translate-x-[2px] rounded-full bg-muted transition-transform data-[state=checked]:translate-x-[16px] data-[state=checked]:bg-accent" />
      </SwitchPrimitive.Root>
    </div>
  )
}
