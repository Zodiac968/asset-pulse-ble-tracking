import { Suspense, lazy } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { AuthCallback, FullScreenStatus, ProtectedRoute } from '@/components/auth/RouteGuards'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import LiveTracking from '@/pages/LiveTracking'
import Login from '@/pages/Login'

const Devices = lazy(() => import('@/pages/Devices'))
const Calibration = lazy(() => import('@/pages/Calibration'))
const Analytics = lazy(() => import('@/pages/Analytics'))
const Settings = lazy(() => import('@/pages/Settings'))

function PageFallback() {
  return <div className="p-6 text-xs text-muted">Loading…</div>
}

function NotFound() {
  return (
    <FullScreenStatus>
      <div>Page not found.</div>
      <Button asChild size="sm">
        <Link to="/">Go to Live Tracking</Link>
      </Button>
    </FullScreenStatus>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<LiveTracking />} />
        {(
          [
            ['devices', Devices],
            ['calibration', Calibration],
            ['analytics', Analytics],
            ['settings', Settings],
          ] as const
        ).map(([path, Page]) => (
          <Route
            key={path}
            path={path}
            element={
              <Suspense fallback={<PageFallback />}>
                <Page />
              </Suspense>
            }
          />
        ))}
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
