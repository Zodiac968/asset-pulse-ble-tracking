import { BarChart3, ChevronDown, Cpu, Crosshair, FlaskConical, LogOut, MapPinned, Settings, User } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { env } from '@/config/env'
import { useAssetTracking } from '@/hooks/useAssetTracking'
import { useHealth } from '@/hooks/useHealth'
import { useReceiverStatus } from '@/hooks/useReceiverStatus'
import { useTrackingRecorder } from '@/hooks/useTrackingRecorder'
import { formatAge, formatClock } from '@/utils/time'
import { cn } from '@/utils/cn'
import { useSession } from '../auth/SessionProvider'
import { Badge, StatusDot } from '../ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip } from '../ui/overlay'
import { Logo } from './Logo'

export const NAV = [
  { to: '/', label: 'Live Tracking', icon: MapPinned, end: true },
  { to: '/devices', label: 'Devices', icon: Cpu },
  { to: '/calibration', label: 'Calibration', icon: Crosshair },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

function Sidebar() {
  return (
    <nav aria-label="Primary" className="flex w-14 shrink-0 flex-col border-r border-border bg-surface lg:w-52">
      <div className="flex h-14 items-center border-b border-border px-3.5 lg:px-4">
        <span className="lg:hidden">
          <Logo collapsed />
        </span>
        <span className="hidden lg:block">
          <Logo />
        </span>
      </div>
      <ul className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV.map(({ to, label, icon: Icon, ...rest }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={'end' in rest}
              title={label}
              aria-label={label}
              className={({ isActive }) =>
                cn(
                  'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors',
                  isActive ? 'bg-accent/10 text-accent ring-1 ring-accent/25 ring-inset' : 'text-muted hover:bg-panel hover:text-foreground',
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              <span className="hidden lg:inline">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="hidden border-t border-border p-3 text-[10px] leading-relaxed text-subtle lg:block">
        Region <span className="font-mono text-muted">{env.region}</span>
      </div>
    </nav>
  )
}

function HeaderStat({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn('hidden flex-col leading-tight', wide ? 'lg:flex' : 'md:flex')}>
      <span className="text-[10px] tracking-wide text-subtle uppercase">{label}</span>
      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground tabular">{children}</span>
    </div>
  )
}

function Header() {
  const location = useLocation()
  const session = useSession()
  const health = useHealth()
  const { lastSuccess, now, error } = useAssetTracking()
  const { onlineCount, total } = useReceiverStatus()
  const page = NAV.find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)))?.label ?? 'AssetPulse'

  const apiOk = health.isSuccess && health.data.ok && !error
  const apiTone = health.isPending ? 'muted' : apiOk ? 'ok' : 'danger'
  const apiLabel = session.mode === 'demo' ? 'Simulator' : health.isPending ? 'Checking…' : apiOk ? 'Connected' : 'Disconnected'

  return (
    <header className="flex h-14 shrink-0 items-center gap-5 border-b border-border bg-surface/80 px-4 backdrop-blur">
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-semibold tracking-tight">{page}</h1>
      </div>
      {session.mode === 'demo' && (
        <Badge tone="demo" className="py-1">
          <FlaskConical /> DEMO MODE · simulated data
        </Badge>
      )}
      <div className="ml-auto flex items-center gap-5">
        <Tooltip content={error ? `Last error: ${error.message}` : health.isError ? health.error.message : `API Gateway ${env.apiBaseUrl || '(not configured)'}`}>
          <div className="flex flex-col leading-tight">
            <span className="hidden text-[10px] tracking-wide text-subtle uppercase md:block">AWS API</span>
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <StatusDot tone={apiTone} pulse={apiOk} />
              {apiLabel}
            </span>
          </div>
        </Tooltip>
        <HeaderStat label="Receivers">
          <StatusDot tone={onlineCount === total ? 'ok' : onlineCount > 0 ? 'warn' : 'danger'} />
          {onlineCount}/{total} online
        </HeaderStat>
        <HeaderStat label="Last update" wide>{lastSuccess ? formatAge(now - lastSuccess) : '—'}</HeaderStat>
        <HeaderStat label="Time">
          <span className="font-mono">{formatClock(now)}</span>
        </HeaderStat>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md border border-border-strong px-2 py-1 text-xs hover:bg-panel">
            <span className="grid size-6 place-items-center rounded-full bg-panel-raised text-muted">
              <User className="size-3.5" />
            </span>
            <span className="hidden max-w-32 truncate sm:inline">{session.user?.name ?? 'User'}</span>
            <ChevronDown className="size-3 text-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>
              <div className="font-medium text-foreground">{session.user?.name}</div>
              {session.user?.email && <div>{session.user.email}</div>}
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge tone={session.mode === 'demo' ? 'demo' : 'info'}>{session.mode === 'demo' ? 'Demo' : 'Live · Cognito'}</Badge>
                <Badge tone={session.canWrite ? 'ok' : 'muted'}>{session.canWrite ? 'read + write' : 'read only'}</Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem danger onSelect={session.signOut}>
              <LogOut /> {session.mode === 'demo' ? 'Exit Demo Mode' : 'Sign out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

export function AppShell() {
  useTrackingRecorder()
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
