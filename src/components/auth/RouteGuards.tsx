import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { LogoMark } from '../layout/Logo'
import { Button } from '../ui/button'
import { Callout } from '../ui/misc'
import { useSession } from './SessionProvider'

export function FullScreenStatus({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="flex flex-col items-center gap-3 text-center text-[13px] text-muted">
        <LogoMark className="size-10" />
        {children}
      </div>
    </div>
  )
}

/** Allows Demo Mode, or Live mode with a valid Cognito session. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const session = useSession()
  const location = useLocation()
  if (session.mode === 'demo') return <>{children}</>
  if (session.mode === 'live' && session.status === 'loading')
    return (
      <FullScreenStatus>
        <Loader2 className="size-4 animate-spin" /> Restoring session…
      </FullScreenStatus>
    )
  if (session.mode === 'live' && session.status === 'authenticated') return <>{children}</>
  return <Navigate to="/login" replace state={{ from: location.pathname }} />
}

/** Cognito redirects here; react-oidc-context completes the PKCE code exchange. */
export function AuthCallback() {
  const session = useSession()
  if (session.status === 'authenticated') return <Navigate to="/" replace />
  if (session.error)
    return (
      <FullScreenStatus>
        <Callout tone="danger" title="Sign-in failed">
          {session.error}
        </Callout>
        <Button asChild size="sm">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </FullScreenStatus>
    )
  if (session.status === 'unauthenticated' || session.status === 'unconfigured') return <Navigate to="/login" replace />
  return (
    <FullScreenStatus>
      <Loader2 className="size-4 animate-spin" /> Completing sign-in…
    </FullScreenStatus>
  )
}
