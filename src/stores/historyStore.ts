import { create } from 'zustand'
import { EVENT_LIMIT, RECEIVER_META, RECEIVER_STALE_MS, RSSI_HISTORY_LIMIT, TRAIL_LIMIT } from '@/config/constants'
import { RECEIVER_IDS, type ReceiverId } from '@/types/room'
import type { AssetState, LocalizationStatus, ReceiverLink, SessionEvent } from '@/types/tracking'
import { deriveLink } from '@/utils/receivers'
import { deriveLocalizationStatus } from '@/utils/localization'

/**
 * Session history: accumulated in browser memory from polled results only.
 * The backend stores the latest observation per receiver, not a time series,
 * so nothing here is persistent AWS history.
 */
export interface RssiRow {
  t: number
  values: Partial<Record<ReceiverId, { raw: number | null; filtered: number | null } | null>>
}

export interface TrailPoint {
  x: number
  y: number
  t: number
}

export interface DiagnosticRow {
  t: number
  status: LocalizationStatus
  rmse: number | null
  receiversUsed: number | null
}

export interface ZoneTransition {
  t: number
  from: string | null
  to: string
}

interface Cursor {
  assetUpdatedAt: number | null
  status: LocalizationStatus | null
  zone: string | null
  links: Partial<Record<ReceiverId, ReceiverLink>>
  loggedPos: { x: number; y: number } | null
  failing: boolean
}

interface HistoryState {
  startedAt: number
  rssi: RssiRow[]
  trail: TrailPoint[]
  events: SessionEvent[]
  diagnostics: DiagnosticRow[]
  zoneTransitions: ZoneTransition[]
  lastSeen: Record<string, number>
  polls: { ok: number; failed: number }
  statusCounts: Partial<Record<LocalizationStatus, number>>
  cursor: Cursor
  ingest: (asset: AssetState, now: number) => void
  ingestError: (message: string, now: number) => void
  log: (kind: SessionEvent['kind'], message: string, tone?: SessionEvent['tone']) => void
  clear: () => void
}

const cap = <T>(arr: T[], n: number) => (arr.length > n ? arr.slice(arr.length - n) : arr)

let seq = 0
const event = (kind: SessionEvent['kind'], message: string, tone: SessionEvent['tone'], t = Date.now()): SessionEvent => ({
  id: `${t}-${++seq}`,
  t,
  kind,
  message,
  tone,
})

const initial = () => ({
  startedAt: Date.now(),
  rssi: [] as RssiRow[],
  trail: [] as TrailPoint[],
  events: [] as SessionEvent[],
  diagnostics: [] as DiagnosticRow[],
  zoneTransitions: [] as ZoneTransition[],
  lastSeen: {} as Record<string, number>,
  polls: { ok: 0, failed: 0 },
  statusCounts: {} as Partial<Record<LocalizationStatus, number>>,
  cursor: { assetUpdatedAt: null, status: null, zone: null, links: {}, loggedPos: null, failing: false } as Cursor,
})

export const useHistoryStore = create<HistoryState>()((set) => ({
  ...initial(),

  ingest: (asset, now) =>
    set((s) => {
      const events: SessionEvent[] = []
      const lastSeen = { ...s.lastSeen }
      const values: RssiRow['values'] = {}
      const links: Cursor['links'] = {}

      if (s.cursor.failing) events.push(event('resumed', 'Tracking API connection restored', 'ok', now))

      for (const id of RECEIVER_IDS) {
        const obs = asset.receivers[id]
        if (obs?.updatedAt) lastSeen[id] = Math.max(lastSeen[id] ?? 0, obs.updatedAt)
        const fresh = obs?.updatedAt != null && now - obs.updatedAt <= RECEIVER_STALE_MS
        values[id] = fresh ? { raw: obs!.rssi, filtered: obs!.filteredRssi } : null
        const link = deriveLink(lastSeen[id] ?? null, now)
        links[id] = link
        const prev = s.cursor.links[id]
        const label = RECEIVER_META[id].label
        if (prev === 'online' && link !== 'online') events.push(event('stale', `${label} data became stale`, 'warn', now))
        if (prev && prev !== 'online' && link === 'online') events.push(event('resumed', `${label} data resumed`, 'ok', now))
      }

      const status = deriveLocalizationStatus(asset, false, now)
      if (s.cursor.status !== null && status !== s.cursor.status)
        events.push(
          event('status', `Localization: ${status.replace(/_/g, ' ')}`, status === 'estimated' ? 'ok' : 'warn', now),
        )

      let trail = s.trail
      let loggedPos = s.cursor.loggedPos
      const newEstimate = asset.updatedAt !== s.cursor.assetUpdatedAt
      if (status === 'estimated' && asset.x !== null && asset.y !== null && newEstimate) {
        trail = cap([...trail, { x: asset.x, y: asset.y, t: asset.updatedAt ?? now }], TRAIL_LIMIT)
        if (!loggedPos || Math.hypot(asset.x - loggedPos.x, asset.y - loggedPos.y) >= 0.5) {
          events.push(event('position', `Position updated to (${asset.x.toFixed(2)}, ${asset.y.toFixed(2)}) m`, 'info', now))
          loggedPos = { x: asset.x, y: asset.y }
        }
      }

      let zone = s.cursor.zone
      let zoneTransitions = s.zoneTransitions
      if (status === 'estimated' && asset.currentZone && asset.currentZone !== zone) {
        if (zone !== null) events.push(event('zone', `Estimated zone changed: ${zone} → ${asset.currentZone}`, 'info', now))
        zoneTransitions = cap([...zoneTransitions, { t: now, from: zone, to: asset.currentZone }], EVENT_LIMIT)
        zone = asset.currentZone
      }

      return {
        lastSeen,
        rssi: cap([...s.rssi, { t: now, values }], RSSI_HISTORY_LIMIT),
        trail,
        events: cap([...s.events, ...events], EVENT_LIMIT),
        diagnostics: cap(
          [...s.diagnostics, { t: now, status, rmse: asset.rangeResidualRmseM, receiversUsed: asset.receiversUsed }],
          RSSI_HISTORY_LIMIT,
        ),
        zoneTransitions,
        polls: { ...s.polls, ok: s.polls.ok + 1 },
        statusCounts: { ...s.statusCounts, [status]: (s.statusCounts[status] ?? 0) + 1 },
        cursor: { assetUpdatedAt: asset.updatedAt, status, zone, links, loggedPos, failing: false },
      }
    }),

  ingestError: (message, now) =>
    set((s) => ({
      polls: { ...s.polls, failed: s.polls.failed + 1 },
      statusCounts: { ...s.statusCounts, api_disconnected: (s.statusCounts.api_disconnected ?? 0) + 1 },
      rssi: cap([...s.rssi, { t: now, values: {} }], RSSI_HISTORY_LIMIT),
      events: s.cursor.failing ? s.events : cap([...s.events, event('error', `Tracking API error: ${message}`, 'danger', now)], EVENT_LIMIT),
      cursor: { ...s.cursor, failing: true, status: 'api_disconnected' },
    })),

  log: (kind, message, tone = 'info') => set((s) => ({ events: cap([...s.events, event(kind, message, tone)], EVENT_LIMIT) })),

  clear: () => set(initial()),
}))
