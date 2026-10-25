import type { HlsConfig } from "hls.js"

/** Resilient settings for the visible player. */
export const PLAYER_HLS_CONFIG: Partial<HlsConfig> = {
  enableWorker: true,
  capLevelToPlayerSize: true,
  startLevel: -1,
  maxBufferLength: 15,
  maxMaxBufferLength: 30,
  manifestLoadingMaxRetry: 3,
  levelLoadingMaxRetry: 3,
  fragLoadingMaxRetry: 4,
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
