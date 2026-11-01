import { FlaskConical, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '@/components/auth/SessionProvider'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/misc'
import { APP_SUBTITLE, DEFAULT_ROOM, RECEIVER_META } from '@/config/constants'
import { env, isLiveConfigured, missingLiveConfig } from '@/config/env'
import { useModeStore } from '@/stores/modeStore'
import { RECEIVER_IDS } from '@/types/room'

function Schematic() {
  const { width: W, length: L, receivers } = DEFAULT_ROOM
  const s = 60
  return (
    <svg viewBox={`-20 -20 ${W * s + 40} ${L * s + 40}`} className="w-full max-w-md" aria-hidden>
      <rect x={0} y={0} width={W * s} height={L * s} fill="#0c141c" stroke="#3b5068" strokeWidth={1.5} />
      {Array.from({ length: W - 1 }, (_, i) => (
        <line key={`x${i}`} x1={(i + 1) * s} x2={(i + 1) * s} y1={0} y2={L * s} stroke="#1b2733" />
      ))}
      {Array.from({ length: L - 1 }, (_, i) => (
        <line key={`y${i}`} y1={(i + 1) * s} y2={(i + 1) * s} x1={0} x2={W * s} stroke="#1b2733" />
      ))}
      <polyline points={`${3 * s},${L * s} ${3 * s},${2.25 * s} 0,${0.4 * s}`} fill="none" stroke="#2b3b4d" strokeDasharray="5 5" />
      <polyline points={`${3 * s},${2.25 * s} ${W * s},${0.4 * s}`} fill="none" stroke="#2b3b4d" strokeDasharray="5 5" />
      {RECEIVER_IDS.map((id) => {
        const r = receivers[id]
        return (
          <g key={id} transform={`translate(${r.x * s} ${(L - r.y) * s})`}>
            <circle r={60} fill={RECEIVER_META[id].color} opacity={0.05} />
            <circle r={11} fill="#0f1922" stroke={RECEIVER_META[id].color} strokeWidth={2} />
            <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill={RECEIVER_META[id].color}>
              {RECEIVER_META[id].short}
            </text>
          </g>
        )
      })}
      <circle cx={2.4 * s} cy={(L - 1.7) * s} r={7} fill="#f472b6" />
      <circle cx={2.4 * s} cy={(L - 1.7) * s} r={16} fill="none" stroke="#f472b6" strokeOpacity={0.35} />
    </svg>
  )
}

export default function Login() {
  const session = useSession()
  const setMode = useModeStore((s) => s.setMode)
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (session.mode === 'demo' || (session.mode === 'live' && session.status === 'authenticated')) return <Navigate to={from} replace />

  const loading = session.status === 'loading'

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface bg-grid-faint p-10 lg:flex">
        <Logo />
        <div className="space-y-6">
          <Schematic />
          <div className="max-w-md space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">Indoor BLE asset tracking on AWS</h2>
            <p className="text-sm leading-relaxed text-muted">
              ESP32 receivers stream beacon RSSI to AWS IoT Core. AssetPulse visualizes the room, Voronoi zones, receiver health and backend localization estimates — and runs
              remote calibration through API Gateway.
            </p>
          </div>
        </div>
        <p className="text-[11px] text-subtle">Region {env.region} · Amazon Cognito · API Gateway · Lambda · DynamoDB</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-5">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Sign in to AssetPulse</h1>
            <p className="mt-1 text-[13px] text-muted">{APP_SUBTITLE}</p>
          </div>

          {session.status === 'expired' && (
            <Callout tone="warn" title="Session expired">
              Your Cognito session has expired or was rejected by the API. Sign in again to continue.
            </Callout>
          )}
          {session.error && session.status !== 'unconfigured' && (
            <Callout tone="danger" title="Authentication error">
              {session.error}
            </Callout>
          )}

          <div className="space-y-2.5 rounded-lg border border-border bg-panel p-4">
            <Button variant="primary" size="lg" className="w-full" disabled={!isLiveConfigured || loading} onClick={session.signIn}>
              {loading ? <Loader2 className="animate-spin" /> : <KeyRound />}
              {loading ? 'Connecting to Cognito…' : 'Sign in with Cognito'}
            </Button>
            <p className="flex items-start gap-1.5 text-[11px] text-subtle">
              <ShieldCheck className="mt-px size-3 shrink-0" /> Redirects to Amazon Cognito Managed Login (OAuth 2.0 authorization code + PKCE). AssetPulse never sees your password.
            </p>
            {!isLiveConfigured && (
              <Callout tone="warn" title="Live mode is not configured">
                Set {missingLiveConfig.join(', ')} in <span className="font-mono">.env</span> to enable Cognito sign-in.
              </Callout>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-subtle">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="secondary" size="lg" className="w-full" onClick={() => setMode('demo')}>
            <FlaskConical /> Explore Demo Mode
          </Button>
          <p className="text-center text-[11px] text-subtle">Demo Mode uses a built-in simulator and is always labeled as simulated data.</p>
        </div>
      </section>
    </div>
  )
}
