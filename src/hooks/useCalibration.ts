import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useApi } from '@/app/ApiProvider'
import { useCalibrationStore } from '@/stores/calibrationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { errorMessage } from '@/types/api'
import { useNow } from './useNow'
import { queryKeys } from './queryKeys'

export function useCalibrationModels() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.calibrationModels(api.mode),
    queryFn: () => api.getCalibrationModels(),
    staleTime: 30_000,
  })
}

export function useCalibration() {
  const api = useApi()
  const qc = useQueryClient()
  const log = useHistoryStore((s) => s.log)
  const store = useCalibrationStore()
  const { localSampling, setLocalSampling } = store
  const now = useNow()

  const statusQuery = useQuery({
    queryKey: queryKeys.calibrationStatus(api.mode),
    queryFn: () => api.getCalibrationStatus(),
    refetchInterval: (q) => (q.state.data?.points.some((p) => p.active) || localSampling !== null ? 1500 : 6000),
  })
  const modelsQuery = useCalibrationModels()

  const status = statusQuery.data
  const session = status?.session ?? null
  const points = useMemo(() => status?.points ?? [], [status])

  /**
   * Which point is collecting. The backend's status response has no per-point
   * state (and session.state stays "sampling" forever), so unless points carry
   * an explicit `active` flag we use the point_id/expires_at returned by
   * POST /calibration/point. expires_at is the backend's own deadline.
   */
  const derived = useMemo(() => {
    const serverActive = points.find((p) => p.active === true) ?? null
    const serverKnows = points.some((p) => p.active !== null)
    // Until status loads, keep the record; once loaded it must belong to the current session.
    const sameSession = !status || (session !== null && (!localSampling?.sessionId || localSampling.sessionId === session.sessionId))
    const local = localSampling && sameSession ? localSampling : null
    const localOpen = Boolean(local && (local.expiresAt === null || now < local.expiresAt))
    const isSampling = serverActive !== null || (!serverKnows && localOpen)
    const activePoint = serverActive ?? (isSampling ? (points.find((p) => p.pointId === local?.pointId) ?? null) : null)
    const activeId = isSampling ? (activePoint?.pointId ?? local?.pointId ?? null) : null
    const completed = points.filter((p) => p.pointId !== activeId)
    return { activePoint, isSampling, completed, serverKnows, sameSession, localOpen }
  }, [status, points, session, localSampling, now])

  // Drop the local sampling record once it no longer applies.
  useEffect(() => {
    if (!localSampling) return
    if (!derived.sameSession) setLocalSampling(null)
    else if (derived.serverKnows && !derived.isSampling) setLocalSampling(null)
    else if (!derived.localOpen) {
      setLocalSampling(null)
      log('calibration', 'Backend collection window ended (expires_at reached)', 'info')
    }
  }, [derived.sameSession, derived.serverKnows, derived.isSampling, derived.localOpen, localSampling, setLocalSampling, log])

  const sessionId = session?.sessionId ?? store.startedSessionId
  const invalidateStatus = () => qc.invalidateQueries({ queryKey: queryKeys.calibrationStatus(api.mode) })

  const start = useMutation({
    mutationFn: () => api.startCalibration(),
    onSuccess: async (r) => {
      store.setStartedSessionId(r.sessionId)
      store.setFit(null)
      store.setApply(null)
      store.setLocalSampling(null)
      log('calibration', `Calibration session started (${r.sessionId})`, 'info')
      toast.success('Calibration session started')
      await invalidateStatus()
    },
    onError: (e) => toast.error(`Could not start calibration: ${errorMessage(e)}`),
  })

  const samplePoint = useMutation({
    mutationFn: (p: { x: number; y: number }) => api.startCalibrationPoint(p),
    onSuccess: async (r, p) => {
      store.setLocalSampling({ sessionId, pointId: r.pointId, x: p.x, y: p.y, startedAt: Date.now(), expiresAt: r.expiresAt })
      store.setFit(null)
      log('calibration', `Sampling started at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) m`, 'info')
      if (r.message) toast.info(r.message)
      await invalidateStatus()
    },
    onError: (e) => toast.error(`Could not start sampling: ${errorMessage(e)}`),
  })

  const stop = useMutation({
    mutationFn: () => api.stopCalibrationPoint(),
    onSuccess: async (r) => {
      store.setLocalSampling(null)
      log('calibration', 'Sampling stopped', 'info')
      if (r.message) toast.info(r.message)
      await invalidateStatus()
    },
    onError: async (e) => {
      toast.error(`Could not stop sampling: ${errorMessage(e)}`)
      await invalidateStatus()
    },
  })

  const fit = useMutation({
    mutationFn: () => api.fitCalibration(sessionId),
    onSuccess: async (r) => {
      store.setFit(r)
      store.setApply(null)
      log('calibration', r.allValid ? 'Calibration models fitted (all valid)' : 'Calibration models fitted (validation failed)', r.allValid ? 'ok' : 'warn')
      await invalidateStatus()
    },
    onError: (e) => toast.error(`Fit rejected: ${errorMessage(e)}`),
  })

  const apply = useMutation({
    mutationFn: (id: string) => api.applyCalibration(id),
    onSuccess: async (r, id) => {
      if (!r.ok) {
        toast.error(r.message ?? 'The backend did not confirm activation.')
        return
      }
      store.setApply({ result: r, at: Date.now(), sessionId: id })
      log('calibration', 'Calibration completed — models activated by backend', 'ok')
      toast.success('Calibration models activated')
      await qc.invalidateQueries({ queryKey: queryKeys.calibrationModels(api.mode) })
      await qc.invalidateQueries({ queryKey: queryKeys.asset(api.mode) })
      await invalidateStatus()
    },
    onError: (e) => toast.error(`Activation rejected: ${errorMessage(e)}`),
  })

  return {
    statusQuery,
    modelsQuery,
    session,
    sessionId,
    points,
    ...derived,
    start,
    samplePoint,
    stop,
    fit,
    apply,
    store,
  }
}
