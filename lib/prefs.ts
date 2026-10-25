const SESSION_PREFS_KEY = "sports-tv:session:v1"

export type SessionPrefs = {
  /** Last selected server. */
  serverId?: string
  /** Last channel that actually played. */
  channelId?: string
  /** Last typed search term (remembered for, but not auto-restored). */
  search?: string
}

/** Reads the remembered app state. Storage failures behave like no data. */
export function readSessionPrefs(): SessionPrefs {
  if (typeof window === "undefined") return {}

  try {
    const raw = window.localStorage.getItem(SESSION_PREFS_KEY)
    if (!raw) return {}

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return {}

    const value = parsed as Partial<SessionPrefs>
    const prefs: SessionPrefs = {}

    if (typeof value.serverId === "string") prefs.serverId = value.serverId
    if (typeof value.channelId === "string") prefs.channelId = value.channelId
    if (typeof value.search === "string") prefs.search = value.search

    return prefs
  } catch {
    // Unreadable storage behaves like an empty cache.
    return {}
  }
}

/** Merges a partial update into the stored preferences. Failures are silent. */
export function writeSessionPrefs(partial: SessionPrefs): void {
  if (typeof window === "undefined") return

  try {
    const next = { ...readSessionPrefs(), ...partial }
    window.localStorage.setItem(SESSION_PREFS_KEY, JSON.stringify(next))
  } catch {
    // Storage can be disabled or full; the session simply is not remembered.
  }
}

/**
 * localStorage key for the bandwidth estimate measured during stable
 * playback. The value is a JSON `{ bps, at }` object.
 */
const BANDWIDTH_KEY = "sports-tv:bandwidth:v1"

/** Estimates older than a day may describe a different network entirely. */
const BANDWIDTH_TTL_MS = 24 * 60 * 60 * 1000

/** Anything below this floor is noise (a momentary dead zone), not bandwidth. */
const MIN_SANE_BPS = 100_000

/** Anything above ~100 Mbps is a storage/corruption artifact, not bandwidth. */
const MAX_SANE_BPS = 100 * 1000 * 1000

/**
 * Reads the last saved bandwidth estimate in bits per second, or null when
 * nothing valid exists (missing, corrupt, out of range or older than a day).
 */
export function readBandwidthEstimate(): number | null {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(BANDWIDTH_KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return null

    const value = parsed as { bps?: unknown; at?: unknown }

    if (
      typeof value.bps !== "number" ||
      !Number.isFinite(value.bps) ||
      typeof value.at !== "number" ||
      !Number.isFinite(value.at)
    ) {
      return null
    }

    if (value.bps < MIN_SANE_BPS || value.bps > MAX_SANE_BPS) return null
    if (Date.now() - value.at > BANDWIDTH_TTL_MS) return null

    return value.bps
  } catch {
    return null
  }
}

/**
 * Saves a measured bandwidth estimate for the next playback session.
 * Invalid values and storage failures are silently ignored.
 */
export function writeBandwidthEstimate(bps: number): void {
  if (typeof window === "undefined") return
  if (!Number.isFinite(bps) || bps < MIN_SANE_BPS || bps > MAX_SANE_BPS) return

  try {
    window.localStorage.setItem(
      BANDWIDTH_KEY,
      JSON.stringify({ bps: Math.round(bps), at: Date.now() })
    )
  } catch {
    // Storage can be disabled or full; the estimate is simply not saved.
  }
}

/** The quality preset the user chose for playback. */
export type QualityChoice = "auto" | "saver" | { height: number }

/** localStorage key for the quality preset (an "auto"/"saver"/height string). */
const QUALITY_KEY = "sports-tv:quality:v1"

/** Reads the remembered quality preset; anything invalid behaves like Auto. */
export function readQualityChoice(): QualityChoice {
  if (typeof window === "undefined") return "auto"

  try {
    const raw = window.localStorage.getItem(QUALITY_KEY)

    if (raw === "auto" || raw === "saver") return raw

    if (raw) {
      const height = Number(raw)

      if (Number.isInteger(height) && height > 0) return { height }
    }
  } catch {
    // Unreadable storage behaves like no preference.
  }

  return "auto"
}

/** Persists the quality preset. Failures are silent. */
export function writeQualityChoice(choice: QualityChoice): void {
  if (typeof window === "undefined") return

  const value =
    choice === "auto" || choice === "saver" ? choice : String(choice.height)

  try {
    window.localStorage.setItem(QUALITY_KEY, value)
  } catch {
    // Storage can be disabled or full; the choice is simply not remembered.
  }
}
