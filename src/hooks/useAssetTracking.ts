import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/app/ApiProvider'
import { useUiStore } from '@/stores/uiStore'
import { deriveLocalizationStatus, describeLocalization } from '@/utils/localization'
import { useNow } from './useNow'
import { queryKeys } from './queryKeys'

/**
 * GET /asset, polled at the configured refresh interval. All components share
 * this single query, so there is only one poll regardless of how many use it.
 */
export function useAssetQuery() {
  const api = useApi()
  const refreshMs = useUiStore((s) => s.refreshMs)
  return useQuery({
    queryKey: queryKeys.asset(api.mode),
    queryFn: () => api.getAsset(),
    refetchInterval: refreshMs,
    refetchIntervalInBackground: false,
    retryDelay: 1000,
  })
}

export function useAssetTracking() {
  const query = useAssetQuery()
  const now = useNow()
  // isError stays true (with the last good data retained) until a fetch succeeds again.
  const status = deriveLocalizationStatus(query.data, query.isError, now)
  return {
    asset: query.data,
    status,
    view: describeLocalization(status),
    error: query.error,
    isLoading: query.isPending,
    lastSuccess: query.dataUpdatedAt || null,
    now,
  }
}
