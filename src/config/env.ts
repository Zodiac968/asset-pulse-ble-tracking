/**
 * Public runtime configuration read from Vite env variables.
 * None of these are secrets: they are public Cognito / API identifiers.
 */
function read(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name]
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDomain(domain: string): string {
  if (!domain) return ''
  const withScheme = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`
  return withScheme.replace(/\/+$/, '')
}

const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'

export const env = {
  region: read('VITE_AWS_REGION') || 'ap-southeast-2',
  userPoolId: read('VITE_COGNITO_USER_POOL_ID'),
  clientId: read('VITE_COGNITO_CLIENT_ID'),
  cognitoDomain: normalizeDomain(read('VITE_COGNITO_DOMAIN')),
  apiBaseUrl: read('VITE_API_BASE_URL').replace(/\/+$/, ''),
  scopes: read('VITE_COGNITO_SCOPES') || 'openid email profile asset-tracker/read asset-tracker/write',
  redirectUri: read('VITE_COGNITO_REDIRECT_URI') || `${origin}/auth/callback`,
  logoutUri: read('VITE_COGNITO_LOGOUT_URI') || `${origin}/`,
} as const

export const isAuthConfigured = Boolean(env.userPoolId && env.clientId && env.cognitoDomain)
export const isApiConfigured = Boolean(env.apiBaseUrl)
export const isLiveConfigured = isAuthConfigured && isApiConfigured

export const missingLiveConfig: string[] = [
  !env.userPoolId && 'VITE_COGNITO_USER_POOL_ID',
  !env.clientId && 'VITE_COGNITO_CLIENT_ID',
  !env.cognitoDomain && 'VITE_COGNITO_DOMAIN',
  !env.apiBaseUrl && 'VITE_API_BASE_URL',
].filter((v): v is string => Boolean(v))

export const SCOPE_READ = 'asset-tracker/read'
export const SCOPE_WRITE = 'asset-tracker/write'
