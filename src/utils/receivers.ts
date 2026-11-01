import { RECEIVER_META, RECEIVER_OFFLINE_MS, RECEIVER_STALE_MS } from '@/config/constants'
import { RECEIVER_IDS, type RoomConfiguration } from '@/types/room'
import type { AssetState, ReceiverLink, ReceiverView } from '@/types/tracking'

/**
 * Receiver connectivity is inferred from beacon observation timestamps only —
 * the backend has no separate device heartbeat. "No recent observations"
 * therefore does not prove the ESP32 is powered off.
 */
export function deriveLink(lastSeen: number | null, now: number, configured = true): ReceiverLink {
  if (!configured) return 'unconfigured'
  if (lastSeen === null) return 'offline'
  const age = now - lastSeen
  if (age <= RECEIVER_STALE_MS) return 'online'
  if (age <= RECEIVER_OFFLINE_MS) return 'no_recent'
  return 'offline'
}

export const LINK_LABEL: Record<ReceiverLink, string> = {
  online: 'Online',
  no_recent: 'No recent observations',
  offline: 'Offline',
  unconfigured: 'Unconfigured',
}

export const LINK_DESCRIPTION: Record<ReceiverLink, string> = {
  online: 'Beacon observations received recently.',
  no_recent: 'Seen earlier, but no beacon observation recently. The receiver may still be powered.',
  offline: 'No beacon observations for an extended period (or never this session). Inferred, not a heartbeat.',
  unconfigured: 'No position configured for this receiver.',
}

export function buildReceiverViews(
  config: RoomConfiguration,
  asset: AssetState | undefined,
  sessionLastSeen: Record<string, number>,
  now: number,
): ReceiverView[] {
  return RECEIVER_IDS.map((id) => {
    const meta = RECEIVER_META[id]
    const position = config.receivers[id] ?? null
    const observation = asset?.receivers[id] ?? null
    const candidates = [observation?.updatedAt ?? null, sessionLastSeen[id] ?? null].filter((v): v is number => v !== null)
    const lastSeen = candidates.length ? Math.max(...candidates) : null
    return {
      id,
      label: meta.label,
      short: meta.short,
      color: meta.color,
      configured: position !== null,
      position,
      link: deriveLink(lastSeen, now, position !== null),
      observation,
      lastSeen,
      ageMs: lastSeen === null ? null : now - lastSeen,
    }
  })
}
