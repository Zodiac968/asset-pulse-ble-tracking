import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from 'react-oidc-context'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { SessionProvider } from '@/components/auth/SessionProvider'
import { TooltipProvider } from '@/components/ui/overlay'
import { isAuthConfigured } from '@/config/env'
import { oidcConfig } from '@/services/auth'
import { ApiError } from '@/types/api'
import { ApiProvider } from './ApiProvider'

function MaybeAuth({ children }: { children: ReactNode }) {
  return isAuthConfigured ? <AuthProvider {...oidcConfig}>{children}</AuthProvider> : <>{children}</>
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            // Never retry auth failures.
            retry: (count, err) => !(err instanceof ApiError && (err.kind === 'unauthorized' || err.kind === 'forbidden')) && count < 1,
          },
          mutations: { retry: false },
        },
      }),
  )
  return (
    <BrowserRouter>
      <QueryClientProvider client={client}>
        <MaybeAuth>
          <SessionProvider>
            <ApiProvider>
              <TooltipProvider delayDuration={250}>
                {children}
                <Toaster
                  theme="dark"
                  position="bottom-right"
                  toastOptions={{ style: { background: '#17222e', border: '1px solid #2b3b4d', color: '#e3eaf2', fontSize: 13 } }}
                />
              </TooltipProvider>
            </ApiProvider>
          </SessionProvider>
        </MaybeAuth>
      </QueryClientProvider>
    </BrowserRouter>
  )
}
