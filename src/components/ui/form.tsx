import { forwardRef, useEffect, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '@/utils/cn'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-8 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2.5 text-[13px] text-foreground tabular placeholder:text-subtle',
      'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring disabled:opacity-50 aria-[invalid=true]:border-danger',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-[11px] font-medium uppercase tracking-wide text-muted', className)} {...props} />
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-8 rounded-md border border-border-strong bg-surface px-2 text-[13px] text-foreground focus-visible:outline-2 focus-visible:outline-ring',
      className,
    )}
    {...props}
  />
))
Select.displayName = 'Select'

interface NumberFieldProps {
  label: ReactNode
  value: number
  onCommit: (value: number) => void
  unit?: string
  step?: number
  min?: number
  max?: number
  disabled?: boolean
  invalid?: boolean
  hint?: ReactNode
  className?: string
  compact?: boolean
}

/**
 * Numeric input that keeps a local text buffer so users can type freely
 * ("1.", "-"), committing a parsed number on each valid keystroke and
 * restoring the canonical value on blur.
 */
export function NumberField({ label, value, onCommit, unit, step = 0.1, min, max, disabled, invalid, hint, className, compact }: NumberFieldProps) {
  const id = useId()
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={text}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn(unit && 'pr-7', compact && 'h-7 text-xs')}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            setText(String(value))
          }}
          onChange={(e) => {
            setText(e.target.value)
            const n = Number(e.target.value)
            if (e.target.value.trim() !== '' && Number.isFinite(n)) onCommit(n)
          }}
        />
        {unit && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-subtle">{unit}</span>}
      </div>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  )
}

export function Progress({ value, tone = 'info', className }: { value: number; tone?: 'info' | 'ok' | 'warn' | 'danger'; className?: string }) {
  const color = { info: 'bg-accent', ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger' }[tone]
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}
