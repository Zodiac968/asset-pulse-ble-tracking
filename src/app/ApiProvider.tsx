import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '@/components/auth/SessionProvider'
import { createLiveApi } from '@/services/api'
import { createDemoApi } from '@/services/mockApi'
import { useHistoryStore } from '@/stores/historyStore'
import { useCalibrationStore } from '@/stores/calibrationStore'
import { useRoomDraftStore } from '@/stores/roomDraftStore'
import type { TrackingApi } from '@/types/api'

const ApiContext = createContext<TrackingApi | null>(null)

export function useApi(): TrackingApi {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi must be used inside ApiProvider')
  return api
}

/**
 * Supplies exactly one data source: the live API Gateway client or the demo
 * simulator. Switching mode clears all cached server data and session history
 * so simulated and live data never mix.
 */
export function ApiProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const queryClient = useQueryClient()
  const sessionRef = useRef(session)
  sessionRef.current = session
  const mode = session.mode === 'demo' ? 'demo' : 'live'

  const api = useMemo<TrackingApi>(
    () =>
      mode === 'demo'
        ? createDemoApi()
        : createLiveApi({
            getAccessToken: () => sessionRef.current.getAccessToken(),
            onUnauthorized: () => sessionRef.current.markUnauthorized(),
          }),
    [mode],
  )

  // Compare with the previous mode (not a "first run" flag, which StrictMode's double effects defeat).
  const previousMode = useRef(mode)
  useEffect(() => {
    if (previousMode.current === mode) return
    previousMode.current = mode
    queryClient.clear()
    useHistoryStore.getState().clear()
    useCalibrationStore.getState().reset()
    useRoomDraftStore.getState().discard()
  }, [mode, queryClient])

  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}
