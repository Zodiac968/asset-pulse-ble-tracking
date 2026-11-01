import { APP_NAME, APP_SUBTITLE } from '@/config/constants'

export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="#0e1a24" stroke="#1f3344" />
      <circle cx="16" cy="16" r="3" fill="#22d3ee" />
      <circle cx="16" cy="16" r="7.5" fill="none" stroke="#22d3ee" strokeOpacity=".55" strokeWidth="1.5" />
      <path d="M16 4.5a11.5 11.5 0 0 1 11.5 11.5" fill="none" stroke="#22d3ee" strokeOpacity=".3" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M16 27.5A11.5 11.5 0 0 1 4.5 16" fill="none" stroke="#22d3ee" strokeOpacity=".3" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-[14px] font-semibold tracking-tight text-foreground">{APP_NAME}</div>
          <div className="text-[10px] text-muted">{APP_SUBTITLE}</div>
        </div>
      )}
    </div>
  )
}
