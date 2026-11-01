import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from 'react-oidc-context'
import { SCOPE_READ, SCOPE_WRITE, env, isApiConfigured, isAuthConfigured } from '@/config/env'
import { cognitoLogoutUrl, scopesFromAccessToken } from '@/services/auth'
import { useModeStore } from '@/stores/modeStore'
import type { DataMode } from '@/types/api'

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'expired' | 'unconfigured'

export interface Session {
  mode: DataMode | null
  status: SessionStatus
  user: { name: string; email: string | null } | null
  scopes: string[]
  canRead: boolean
  canWrite: boolean
  error: string | null
  signIn: () => void
  signOut: () => void
  /** Current access token (never rendered or logged). */
  getAccessToken: () => string | null
  markUnauthorized: () => void
}

const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

function DemoSession({ children }: { children: ReactNode }) {
  const setMode = useModeStore((s) => s.setMode)
  const value = useMemo<Session>(
    () => ({
      mode: 'demo',
      status: 'authenticated',
      user: { name: 'Demo Operator', email: null },
      scopes: [SCOPE_READ, SCOPE_WRITE],
      canRead: true,
      canWrite: true,
      error: null,
      signIn: () => undefined,
      signOut: () => setMode(null),
      getAccessToken: () => null,
      markUnauthorized: () => undefined,
    }),
    [setMode],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

function UnconfiguredSession({ children, mode }: { children: ReactNode; mode: DataMode | null }) {
  const setMode = useModeStore((s) => s.setMode)
  const value = useMemo<Session>(
    () => ({
      mode,
      status: 'unconfigured',
      user: null,
      scopes: [],
      canRead: false,
      canWrite: false,
      error: !isAuthConfigured
        ? 'Cognito is not configured (VITE_COGNITO_* variables missing).'
        : !isApiConfigured
          ? 'VITE_API_BASE_URL is not configured.'
          : null,
      signIn: () => undefined,
      signOut: () => setMode(null),
      getAccessToken: () => null,
      markUnauthorized: () => undefined,
    }),
    [mode, setMode],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

function CognitoSession({ children, mode }: { children: ReactNode; mode: DataMode | null }) {
  const auth = useAuth()
  const setMode = useModeStore((s) => s.setMode)
  const [unauthorized, setUnauthorized] = useState(false)
  const [renewError, setRenewError] = useState<string | null>(null)
  const tokenRef = useRef<string | null>(null)

  const user = auth.user
  const expired = Boolean(user?.expired)
  tokenRef.current = user && !user.expired ? user.access_token : null

  useEffect(() => {
    // A new sign-in or successful renewal clears previous auth errors.
    if (user && !user.expired) {
      setUnauthorized(false)
      setRenewError(null)
    }
  }, [user])

  useEffect(() => {
    return auth.events.addSilentRenewError((err) => setRenewError(err.message || 'Token refresh failed'))
  }, [auth.events])

  const scopes = useMemo(() => scopesFromAccessToken(user?.access_token), [user?.access_token])

  const signIn = useCallback(() => {
    setMode('live')
    void auth.signinRedirect()
  }, [auth, setMode])

  const signOut = useCallback(() => {
    void auth.removeUser().finally(() => {
      setMode(null)
      if (env.cognitoDomain && env.clientId) window.location.assign(cognitoLogoutUrl())
    })
  }, [auth, setMode])

  let status: SessionStatus
  if (auth.isLoading || auth.activeNavigator === 'signinRedirect') status = 'loading'
  else if (auth.isAuthenticated && !expired && !unauthorized) status = 'authenticated'
  else if (user && (expired || unauthorized)) status = 'expired'
  else status = 'unauthenticated'

  const value = useMemo<Session>(
    () => ({
      mode,
      status,
      user: user
        ? {
            name: String(user.profile.name ?? user.profile.preferred_username ?? user.profile.email ?? 'Signed-in user'),
            email: typeof user.profile.email === 'string' ? user.profile.email : null,
          }
        : null,
      scopes,
      canRead: scopes.length === 0 || scopes.includes(SCOPE_READ),
      canWrite: scopes.includes(SCOPE_WRITE),
      error: auth.error?.message ?? renewError,
      signIn,
      signOut,
      getAccessToken: () => tokenRef.current,
      markUnauthorized: () => setUnauthorized(true),
    }),
    [mode, status, user, scopes, auth.error, renewError, signIn, signOut],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const mode = useModeStore((s) => s.mode)
  if (mode === 'demo') return <DemoSession>{children}</DemoSession>
  if (isAuthConfigured && isApiConfigured) return <CognitoSession mode={mode}>{children}</CognitoSession>
  return <UnconfiguredSession mode={mode}>{children}</UnconfiguredSession>
}
