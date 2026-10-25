import type { HlsConfig, RetryConfig } from "hls.js"

/**
 * Retry budget shared by the load types the player uses. Delays grow
 * exponentially from `retryDelayMs` up to `maxRetryDelayMs`, so a short
 * hiccup is absorbed in seconds while a real outage does not spin — and
 * every reload the recovery ladder performs resets these counters anyway.
 */
function playerRetry(maxNumRetry: number, retryDelayMs = 1_000): RetryConfig {
  return {
    maxNumRetry,
    retryDelayMs,
    maxRetryDelayMs: 8_000,
    backoff: "exponential",
  }
}

/**
 * Resilient settings for the visible player, tuned for live streams on
 * slow or flaky networks:
 *
 * - `startLevel: 0` boots on the lowest rendition for the fastest first
 *   frame with zero startup waste. With a saved bandwidth estimate,
 *   `buildPlayerHlsConfig` switches to an automatic start seeded with the
 *   estimate instead.
 * - Conservative ABR (`abrBandWidthFactor` 0.8 / `abrBandWidthUpFactor`
 *   0.6) only upgrades when real headroom exists over the measured
 *   bandwidth — optimistic up-switches are what causes stalls.
 * - `liveSyncDurationCount: 5` keeps a five-segment cushion behind the
 *   live edge so short dips ride through without losing the stream.
 * - Buffering aims for ~30 s ahead (`maxBufferLength`), never runs away
 *   (`maxMaxBufferLength`) and forgets `backBufferLength: 30` of played
 *   media, keeping memory flat on phones during long matches.
 * - Standard non-LL behavior (`lowLatencyMode: false`): whole segments,
 *   generous timeouts and exponential backoff per load type.
 */
export const PLAYER_HLS_CONFIG: Partial<HlsConfig> = {
  enableWorker: true,
  startLevel: 0,
  capLevelToPlayerSize: true,
  abrBandWidthFactor: 0.8,
  abrBandWidthUpFactor: 0.6,
  abrEwmaDefaultEstimate: 500_000,
  liveSyncDurationCount: 5,
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
  backBufferLength: 30,
  lowLatencyMode: false,
  // Allow hls.js's internal stall-nudge many attempts before it gives up;
  // the player's own freeze watchdog reacts well before this cap.
  nudgeMaxRetry: 10,
  manifestLoadPolicy: {
    default: {
      maxTimeToFirstByteMs: 15_000,
      maxLoadTimeMs: 20_000,
      timeoutRetry: playerRetry(4),
      errorRetry: playerRetry(4),
    },
  },
  // Playlists refresh constantly on live streams; a couple of blips from
  // a misconfigured origin must not end playback instantly.
  playlistLoadPolicy: {
    default: {
      maxTimeToFirstByteMs: 15_000,
      maxLoadTimeMs: 20_000,
      timeoutRetry: playerRetry(6),
      errorRetry: playerRetry(6),
    },
  },
  fragLoadPolicy: {
    default: {
      maxTimeToFirstByteMs: 20_000,
      maxLoadTimeMs: 90_000,
      timeoutRetry: playerRetry(8),
      errorRetry: playerRetry(8),
    },
  },
}

/** Sanity floor for a saved estimate (100 kbps means "momentary dead zone"). */
const MIN_SAVED_ESTIMATE_BPS = 100_000

/**
 * Builds the per-instance player configuration.
 *
 * With a saved bandwidth estimate from earlier playback the player boots
 * in automatic mode seeded with that estimate (`startLevel: -1` plus
 * `abrEwmaDefaultEstimate`): the first frames land on the level that
 * estimate supports without a startup bitrate-test fragment, and without
 * the early up-switch stalls a blind low-level start would risk. Without
 * an estimate the base config's lowest-level start applies.
 */
export function buildPlayerHlsConfig(
  savedEstimate?: number | null
): Partial<HlsConfig> {
  const estimate =
    typeof savedEstimate === "number" &&
    Number.isFinite(savedEstimate) &&
    savedEstimate >= MIN_SAVED_ESTIMATE_BPS
      ? savedEstimate
      : null

  if (estimate === null) return { ...PLAYER_HLS_CONFIG }

  return {
    ...PLAYER_HLS_CONFIG,
    startLevel: -1,
    abrEwmaDefaultEstimate: estimate,
  }
}

/**
 * Fast-fail, low-data settings for background stream probes.
 *
 * hls.js sorts a manifest's variants from lowest to highest quality, so
 * `startLevel: 0` boots on the smallest one — and as a side effect skips
 * hls.js's startup bitrate-test fragment, which only runs while the start
 * level is automatic. `lib/stream-test.ts` pins the ABR to level 0 and tears
 * the probe down on its first settled event (metadata or fragment), so a
 * working probe downloads exactly one small fragment.
 */
export const PROBE_HLS_CONFIG: Partial<HlsConfig> = {
  enableWorker: true,
  startLevel: 0,
  autoStartLoad: true,
  capLevelToPlayerSize: false,
  maxBufferLength: 5,
  maxMaxBufferLength: 10,
  manifestLoadingMaxRetry: 0,
  levelLoadingMaxRetry: 0,
  fragLoadingMaxRetry: 0,
}

export function hasNativeHlsSupport(video: HTMLVideoElement) {
  return video.canPlayType("application/vnd.apple.mpegurl") !== ""
}
