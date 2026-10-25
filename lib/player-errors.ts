/**
 * Pure playback-error classification used by the visible player.
 *
 * Keeping this free of DOM and hls.js imports makes every branch directly
 * unit-testable: callers pass the strings/codes hls.js or the media element
 * reported, and receive the recovery policy plus the short UI reason.
 */

export type PlaybackErrorKind = "temporary" | "permanent"

export type PlaybackErrorReason =
  | "network"
  | "timeout"
  | "fragment"
  | "server"
  | "buffer"
  | "media"
  | "manifestNotFound"
  | "unsupportedFormat"
  | "mixedContent"
  | "unplayable"

export type PlaybackErrorInput = {
  /** Which playback engine produced the error. */
  engine: "hls" | "native"
  /** hls.js `ErrorTypes` value (e.g. "networkError"). */
  hlsType?: string
  /** hls.js `ErrorDetails` value (e.g. "manifestLoadError"). */
  details?: string
  /** HTTP status of the failed response, when the loader reported one. */
  httpStatus?: number | null
  /**
   * Consecutive fresh manifest attempts that ended with 403/404/410,
   * including the current one. Two in a row makes the source permanent.
   */
  manifestHttpFailureCount?: number
  /** Native `MediaError.code` (1 = aborted, 4 = source not supported). */
  nativeErrorCode?: number | null
  /** An https page cannot load an http stream (mixed content). */
  mixedContent?: boolean
  /** The browser offers neither native HLS nor MSE/hls.js. */
  unsupported?: boolean
}

export type PlaybackErrorClassification = {
  kind: PlaybackErrorKind
  reason: PlaybackErrorReason
}

/** HTTP statuses that mark a missing/forbidden manifest. */
const PERMANENT_MANIFEST_STATUSES = new Set([403, 404, 410])

/** hls.js details that mean the browser cannot decode this source at all. */
const UNSUPPORTED_DETAILS = new Set([
  "manifestIncompatibleCodecsError",
  "bufferIncompatibleCodecsError",
  "bufferAddCodecError",
])

/** hls.js details that mean the source itself is malformed/unplayable. */
const UNPLAYABLE_DETAILS = new Set(["manifestParsingError", "levelEmptyError"])

export function isPermanentManifestStatus(
  status: number | null | undefined
): boolean {
  return typeof status === "number" && PERMANENT_MANIFEST_STATUSES.has(status)
}

/**
 * Classifies one playback failure.
 *
 * Temporary failures keep the recovery ladder / silent reconnects running.
 * Permanent failures go straight to the error screen (mixed content,
 * unsupported codecs, and a 403/404/410 manifest on two fresh attempts).
 */
export function classifyPlaybackError(
  input: PlaybackErrorInput
): PlaybackErrorClassification {
  if (input.mixedContent) {
    return { kind: "permanent", reason: "mixedContent" }
  }

  if (input.unsupported) {
    return { kind: "permanent", reason: "unsupportedFormat" }
  }

  if (input.engine === "native") {
    // MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
    if (input.nativeErrorCode === 4) {
      return { kind: "permanent", reason: "unsupportedFormat" }
    }

    // MEDIA_ERR_NETWORK / MEDIA_ERR_DECODE / MEDIA_ERR_ABORTED: all keep
    // the reload-and-reconnect path alive.
    if (input.nativeErrorCode === 2) {
      return { kind: "temporary", reason: "network" }
    }

    return { kind: "temporary", reason: "media" }
  }

  const type = input.hlsType ?? ""
  const details = input.details ?? ""
  const status = input.httpStatus ?? null
  const lowerDetails = details.toLowerCase()

  if (UNSUPPORTED_DETAILS.has(details)) {
    return { kind: "permanent", reason: "unsupportedFormat" }
  }

  if (UNPLAYABLE_DETAILS.has(details)) {
    return { kind: "permanent", reason: "unplayable" }
  }

  if (details === "manifestLoadError" && isPermanentManifestStatus(status)) {
    const twoFreshAttempts = (input.manifestHttpFailureCount ?? 0) >= 2

    return {
      kind: twoFreshAttempts ? "permanent" : "temporary",
      reason: "manifestNotFound",
    }
  }

  if (details === "bufferStalledError" || details === "bufferNudgeOnStall") {
    return { kind: "temporary", reason: "buffer" }
  }

  if (lowerDetails.includes("timeout")) {
    return { kind: "temporary", reason: "timeout" }
  }

  if (status !== null && status >= 500) {
    return { kind: "temporary", reason: "server" }
  }

  if (details.startsWith("fragLoad")) {
    return { kind: "temporary", reason: "fragment" }
  }

  if (
    type === "mediaError" ||
    details.startsWith("buffer") ||
    details === "fragParsingError" ||
    details === "fragDecryptError"
  ) {
    return { kind: "temporary", reason: "media" }
  }

  return { kind: "temporary", reason: "network" }
}

/** Short, user-facing reason shown on the error screen next to the actions. */
export function playbackErrorReasonText(reason: PlaybackErrorReason): string {
  switch (reason) {
    case "manifestNotFound":
      return "This channel's stream wasn't found"
    case "unsupportedFormat":
      return "Your browser can't play this stream's format"
    case "mixedContent":
      return "Your browser blocked this stream"
    case "timeout":
      return "The stream is taking too long to respond"
    case "fragment":
      return "The stream stopped sending video"
    case "server":
      return "The stream's server is having problems"
    case "buffer":
      return "Playback stalled while buffering"
    case "media":
      return "Playback was interrupted"
    case "unplayable":
      return "This channel's stream isn't playable"
    case "network":
    default:
      return "The stream isn't responding"
  }
}
