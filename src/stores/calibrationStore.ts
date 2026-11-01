import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Point2D } from '@/types/room'
import type { CalibrationActionResult, CalibrationFitResult } from '@/types/calibration'

/**
 * The point currently being collected, as returned by POST /calibration/point.
 * GET /calibration/status does not expose this, so it is kept here (per tab,
 * surviving reloads). `expiresAt` is the backend's own collection deadline.
 */
export interface SamplingRecord {
  sessionId: string | null
  pointId: string | null
  x: number
  y: number
  startedAt: number
  expiresAt: number | null
}

/** Client-side calibration wizard state. Session/point data itself comes from GET /calibration/status. */
interface CalibrationUiState {
  /** Known beacon position chosen by the operator (not yet submitted). */
  target: Point2D | null
  localSampling: SamplingRecord | null
  /** Session ID returned by POST /calibration/start (fallback until status reports it). */
  startedSessionId: string | null
  fit: CalibrationFitResult | null
  apply: { result: CalibrationActionResult; at: number; sessionId: string } | null
  setTarget: (p: Point2D | null) => void
  setLocalSampling: (s: SamplingRecord | null) => void
  setStartedSessionId: (id: string | null) => void
  setFit: (f: CalibrationFitResult | null) => void
  setApply: (a: CalibrationUiState['apply']) => void
  reset: () => void
}

export const useCalibrationStore = create<CalibrationUiState>()(
  persist(
    (set) => ({
      target: null,
      localSampling: null,
      startedSessionId: null,
      fit: null,
      apply: null,
      setTarget: (target) => set({ target }),
      setLocalSampling: (localSampling) => set({ localSampling }),
      setStartedSessionId: (startedSessionId) => set({ startedSessionId }),
      setFit: (fit) => set({ fit }),
      setApply: (apply) => set({ apply }),
      reset: () => set({ target: null, localSampling: null, startedSessionId: null, fit: null, apply: null }),
    }),
    {
      name: 'assetpulse.calibration',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ target: s.target, localSampling: s.localSampling, startedSessionId: s.startedSessionId }),
    },
  ),
)
