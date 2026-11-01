/**
 * Cognito Managed Login via OAuth 2.0 Authorization Code + PKCE, using
 * oidc-client-ts (through react-oidc-context). No passwords or AWS secrets
 * are handled by the frontend. Tokens stay in sessionStorage (oidc-client-ts
 * default) and are never logged or rendered.
 */
import type { AuthProviderProps } from 'react-oidc-context'
import { WebStorageStateStore } from 'oidc-client-ts'
import { env } from '@/config/env'

export const cognitoAuthority = `https://cognito-idp.${env.region}.amazonaws.com/${env.userPoolId}`

export const oidcConfig: AuthProviderProps = {
  authority: cognitoAuthority,
  client_id: env.clientId,
  redirect_uri: env.redirectUri,
  post_logout_redirect_uri: env.logoutUri,
  response_type: 'code',
  scope: env.scopes,
  automaticSilentRenew: true,
  // Cognito issues refresh tokens to the app client; oidc-client-ts uses them for renewal.
  userStore: typeof window !== 'undefined' ? new WebStorageStateStore({ store: window.sessionStorage }) : undefined,
  onSigninCallback: () => {
    // Strip ?code=&state= from the URL; the callback route then navigates into the app.
    window.history.replaceState({}, document.title, window.location.pathname)
  },
}

/**
 * Cognito does not publish an OIDC end_session_endpoint, so logout uses the
 * Managed Login /logout endpoint. `logout_uri` must be listed as an allowed
 * sign-out URL on the app client.
 */
export function cognitoLogoutUrl(): string {
  const params = new URLSearchParams({ client_id: env.clientId, logout_uri: env.logoutUri })
  return `${env.cognitoDomain}/logout?${params.toString()}`
}

/** Read the `scope` claim from an access token for UI gating only (not verification). */
export function scopesFromAccessToken(token: string | undefined | null): string[] {
  if (!token) return []
  const payload = token.split('.')[1]
  if (!payload) return []
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { scope?: unknown }
    return typeof json.scope === 'string' ? json.scope.split(/\s+/).filter(Boolean) : []
  } catch {
    return []
  }
}
