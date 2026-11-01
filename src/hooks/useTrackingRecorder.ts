import { useEffect } from 'react'
import { useHistoryStore } from '@/stores/historyStore'
import { errorMessage } from '@/types/api'
import { useAssetQuery } from './useAssetTracking'

/**
 * Mounted once (in the app shell): turns each polled GET /asset result into
 * session-local history and events. Only observed state transitions are logged.
 */
export function useTrackingRecorder() {
  const { data, dataUpdatedAt, error, errorUpdatedAt } = useAssetQuery()
  const ingest = useHistoryStore((s) => s.ingest)
  const ingestError = useHistoryStore((s) => s.ingestError)

  useEffect(() => {
    if (data && dataUpdatedAt) ingest(data, dataUpdatedAt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt])

  useEffect(() => {
    if (error && errorUpdatedAt) ingestError(errorMessage(error), errorUpdatedAt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorUpdatedAt])
}
