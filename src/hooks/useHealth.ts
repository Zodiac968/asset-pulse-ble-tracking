import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/app/ApiProvider'
import { queryKeys } from './queryKeys'

export function useHealth() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.health(api.mode),
    queryFn: () => api.getHealth(),
    refetchInterval: 20_000,
    retry: 0,
  })
}
