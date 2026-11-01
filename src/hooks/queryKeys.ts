import type { DataMode } from '@/types/api'

/** Query keys are scoped by data mode so live and demo caches never mix. */
export const queryKeys = {
  health: (m: DataMode) => ['health', m] as const,
  asset: (m: DataMode) => ['asset', m] as const,
  config: (m: DataMode) => ['config', m] as const,
  calibrationStatus: (m: DataMode) => ['calibration', 'status', m] as const,
  calibrationModels: (m: DataMode) => ['calibration', 'models', m] as const,
}
