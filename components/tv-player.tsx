"use client"

import { Maximize, Minimize, PictureInPicture, Play } from "lucide-react"
import Hls, { type ErrorData, type Level } from "hls.js"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  PLAYER_ACTION_GRACE_MS,
  PLAYER_BUFFERING_DELAY_MS,
  PLAYER_ESTIMATE_SAVE_DELAY_MS,
  PLAYER_FRAME_FREEZE_COOLDOWN_MS,
  PLAYER_FRAME_FREEZE_MAX_RUNS,
  PLAYER_FRAME_FREEZE_MS,
  PLAYER_FRAME_FREEZE_RECOVERY_CHECK_MS,
  PLAYER_FRAME_FREEZE_RUN_WINDOW_MS,
  PLAYER_FRAME_FREEZE_SEEK_S,
  PLAYER_FREEZE_CHECK_MS,
  PLAYER_LADDER_GRACE_MS,
  PLAYER_LIVE_BEHIND_MAX_S,
  PLAYER_LIVE_EDGE_OFFSET_S,
  PLAYER_PREBUFFER_DROP_AT_MS,
  PLAYER_PREBUFFER_DROP_RATIO,
  PLAYER_PREBUFFER_MAX_WAIT_MS,
  PLAYER_PREBUFFER_PLAY_NOW_AT_MS,
  PLAYER_PREBUFFER_TARGET_LOW_BW_S,
  PLAYER_PREBUFFER_TARGET_NATIVE_S,
  PLAYER_PREBUFFER_TARGET_S,
  PLAYER_REBUFFER_COOLDOWN_MS,
  PLAYER_REBUFFER_MAX_WAIT_MS,
  PLAYER_REBUFFER_TARGET_S,
  PLAYER_RECONNECT_DELAYS_MS,
  PLAYER_RECONNECT_MAX,
  PLAYER_RECONNECT_STABLE_RESET_MS,
  PLAYER_SAMPLE_INTERVAL_MS,
  PLAYER_STALL_COUNT_LIMIT,
  PLAYER_STALL_WINDOW_MS,
  PLAYER_WAKE_GAP_MS,
} from "@/lib/constants"
import { buildPlayerHlsConfig, hasNativeHlsSupport } from "@/lib/hls"
import {
  classifyPlaybackError,
  isPermanentManifestStatus,
  playbackErrorReasonText,
  type PlaybackErrorInput,
  type PlaybackErrorReason,
} from "@/lib/player-errors"
import {
  readBandwidthEstimate,
  readQualityChoice,
  writeBandwidthEstimate,
  writeQualityChoice,
  type QualityChoice,
} from "@/lib/prefs"
import { useWakeLock } from "@/hooks/use-wake-lock"
import { cn } from "@/lib/utils"

type TVPlayerProps = {
  src: string
  channelName: string
  /** Called when playback actually starts (also after a reconnect). */
  onPlaybackWorking?: () => void
  /** Called once when playback cannot recover: permanent error or no retries left. */
  onPlaybackFailed?: () => void
  /** Reports whether this stream is playing or starting (probes pause meanwhile). */
  onPlaybackActiveChange?: (active: boolean) => void
  /** Escape hatch from the "connection too slow" banner. */
  onTryAnotherChannel?: () => void
}

/**
 * hls.js recovery ladder: startLoad → recoverMediaError →
 * swapAudioCodec + recoverMediaError → reload source at the live edge.
 * Exhausting all steps hands over to the silent reconnects.
 */

/** How often the native-HLS recovery reloads the source before giving up. */
const NATIVE_LADDER_STEP_COUNT = 2

/** The "Data saver" preset caps quality at this height (or the lowest level). */
const DATA_SAVER_MAX_HEIGHT = 480

/**
 * Step-0 diagnostics (dev only): every playback event, buffering decision
 * and recovery action is logged with a wall-clock stamp plus readyState,
 * currentTime and buffered-ahead seconds, so a device log can be matched
 * against what was visibly on screen.
 */
const DEBUG_PLAYBACK = process.env.NODE_ENV !== "production"

declare global {
  interface Window {
    /** Dev-only: freeze the presented-frame counter for a while. */
    __simulateVideoFreeze?: (durationMs?: number) => boolean
    /** Dev-only: emit a fatal network error (503 by default, 404 for permanent). */
    __simulateFatalNetworkError?: (status?: number) => boolean
  }
}

function debugLog(message: string) {
  if (!DEBUG_PLAYBACK) return

  const stamp = new Date().toISOString().slice(11, 23)
  console.log(`[tv-player ${stamp}] ${message}`)
}

/** Safari exposes rVFC without the standard DOM typings on older libs. */
type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number) => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

/** Presented-frame count from the quality API, or null when unavailable. */
function videoFrameCount(video: HTMLVideoElement): number | null {
  try {
    if (typeof video.getVideoPlaybackQuality !== "function") return null

    const quality = video.getVideoPlaybackQuality()

    return Number.isFinite(quality.totalVideoFrames)
      ? quality.totalVideoFrames
      : null
  } catch {
    return null
  }
}

/** Failing request host for the diagnostics log (never a full URL). */
function urlHost(url: string | null | undefined): string {
  if (!url) return "unknown"

  try {
    return new URL(url, window.location.href).host
  } catch {
    return "invalid"
  }
}

/** HTTP status from hls.js loader data (fetch or XHR details). */
function errorHttpStatus(data: ErrorData): number | null {
  const responseCode = data.response?.code
  if (typeof responseCode === "number") return responseCode

  const network = data.networkDetails as { status?: unknown } | null | undefined
  if (network && typeof network.status === "number") return network.status

  return null
}

/**
 * Seconds of media buffered from the playhead forward (or, across a seek
 * gap, from the next range start forward).
 */
function bufferedAheadSeconds(video: HTMLVideoElement): number {
  try {
    const ranges = video.buffered
    const time = video.currentTime

    for (let i = 0; i < ranges.length; i += 1) {
      if (ranges.start(i) <= time && time <= ranges.end(i)) {
        return Math.max(0, ranges.end(i) - time)
      }
    }

    for (let i = 0; i < ranges.length; i += 1) {
      if (ranges.start(i) >= time) return Math.max(0, ranges.end(i) - time)
    }
  } catch {
    // Browsers can throw while the buffer has no ranges yet.
  }

  return 0
}

/** Canonical one-line element snapshot for the debug log. */
function videoFacts(video: HTMLVideoElement): string {
  const ahead = bufferedAheadSeconds(video).toFixed(2)
  const frames = videoFrameCount(video)

  return `rs=${video.readyState} t=${video.currentTime.toFixed(2)} ahead=${ahead} frames=${frames ?? "n/a"}`
}

/** True when a rejection came from our own pause() aborting a play(). */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

/** Mutable state of the pre-first-play buffer hold. */
type PrebufferState = {
  /** True while the tap gesture is parked and the buffer is filling. */
  active: boolean
  /** when the hold began (drives progress, Play-now and the auto drop). */
  startedAt: number
  /** Buffered-ahead seconds required before the first play resumes. */
  target: number
  /** True once the too-slow quality drop has been considered. */
  targetAdjusted: boolean
  /** True when the drop actually changed the cap (diagnostics only). */
  dropped: boolean
}

/** Idle prebuffer state; also the reset shape between attempts. */
function idlePrebuffer(): PrebufferState {
  return {
    active: false,
    startedAt: 0,
    target: 0,
    targetAdjusted: false,
    dropped: false,
  }
}

/** A selectable rendition: what the control shows plus its hls.js index. */
type QualityLevel = {
  /** hls.js level index (lowest first). */
  index: number
  /** Rendition height (e.g. 720); audio-only levels never appear here. */
  height: number
  /** Average bitrate, used to prefer the best rendition per height. */
  bitrate: number
}

/**
 * One entry per distinct height (the best-bitrate rendition wins), sorted
 * from highest to lowest for the quality control.
 */
function chooseDisplayLevels(levels: readonly Level[]): QualityLevel[] {
  const byHeight = new Map<number, QualityLevel>()

  for (const [index, level] of levels.entries()) {
    const height = Math.round(level.height ?? 0)

    if (!Number.isFinite(height) || height <= 0) continue

    const existing = byHeight.get(height)

    if (!existing || level.bitrate > existing.bitrate) {
      byHeight.set(height, { index, height, bitrate: level.bitrate })
    }
  }

  const display = [...byHeight.values()]
  display.sort((a, b) => b.height - a.height)

  return display
}

/** Highest level at or below the saver cap, or the lowest level. */
function saverCapIndex(levels: readonly QualityLevel[]): number {
  let cap = -1

  for (const level of levels) {
    if (level.height <= DATA_SAVER_MAX_HEIGHT) cap = level.index
  }

  return cap >= 0 ? cap : 0
}

/**
 * Applies a saved quality preset to a live hls.js instance: Auto clears
 * any cap, Data saver capping keeps ABR active below ~480p, and a fixed
 * height pins that level (heights the stream does not carry stay Auto).
 */
function applyQualityChoice(
  choice: QualityChoice,
  instance: Hls | null,
  levels: readonly QualityLevel[]
) {
  if (!instance) return

  if (choice === "saver") {
    instance.autoLevelCapping = saverCapIndex(levels)
    instance.currentLevel = -1
    return
  }

  if (choice === "auto") {
    instance.autoLevelCapping = -1
    instance.currentLevel = -1
    return
  }

  let target: QualityLevel | null = null

  for (const level of levels) {
    if (level.height === choice.height) target = level
  }

  if (target) {
    instance.autoLevelCapping = -1
    instance.currentLevel = target.index
  }
}

/** iPhone Safari only supports fullscreen on the video element itself. */
type WebkitFullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void
}

/** Screen orientation apis are missing or narrowed differently per browser. */
type OrientationCapable = {
  orientation?: {
    lock?: (orientation: string) => Promise<void>
    unlock?: () => void
  }
}

/**
 * HLS player with a click-to-start overlay.
 *
 * Native playback (Safari/iOS) is preferred when the browser announces HLS
 * support on `video.canPlayType`; hls.js is used only when MSE+hls.js works
 * and native does not. Mount this component with a `key` that changes when
 * `src` changes so all playback state resets for the new channel.
 *
 * Resilience:
 * - a facts sampler (250 ms) is the single source of truth for buffering:
 *   the "Buffering..." spinner appears only when the playhead verifiably
 *   stopped or readyState dropped, never from `waiting`/`stalled` events;
 * - a playhead freeze first pauses into a refill hold (one per cooldown
 *   window), then the facts still say stuck: nudge, live-edge jump, then
 *   the hls.js recovery ladder;
 * - a separate frame watchdog catches the audio-keeps-playing failure:
 *   no newly presented frame for 4 s runs a tiny-seek → pause/play →
 *   media-recovery → live-edge restart ladder;
 * - a failed ladder is not the end: the player silently rebuilds hls.js
 *   and the video element (1/3/6 s backoff, live edge) while the
 *   "Reconnecting..." overlay covers the gap; only a permanent error or
 *   three exhausted reconnects reaches the error screen;
 * - the first play is pre-buffered: the tap gesture claims the autoplay
 *   right, the playhead parks until the buffer target (8/12 s hls.js,
 *   5 s native) is reached or the wait ceiling expires;
 * - every hls.js fatal error walks the ladder instead of failing at once,
 *   with one rung consumed per error wave (burst protection);
 * - the bandwidth estimate measured during ten stable seconds is saved for
 *   the next playback (`abrEwmaDefaultEstimate`).
 */
export function TVPlayer({
  src,
  channelName,
  onPlaybackWorking,
  onPlaybackFailed,
  onPlaybackActiveChange,
  onTryAnotherChannel,
}: TVPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  const hasStartedRef = useRef(false)
  const startingRef = useRef(false)
  const unsupportedRef = useRef(false)

  const onPlaybackWorkingRef = useRef(onPlaybackWorking)
  const onPlaybackFailedRef = useRef(onPlaybackFailed)
  const onPlaybackActiveChangeRef = useRef(onPlaybackActiveChange)
  const onTryAnotherChannelRef = useRef(onTryAnotherChannel)

  const [hasStarted, setHasStarted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  // The full span from play-tap through buffering to playing: probing in
  // the list must stay silent during this entire window, not only while
  // frames are actually rendered.
  const [streamActive, setStreamActive] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [reloadToken, setReloadToken] = useState(0)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [awaitingResume, setAwaitingResume] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [canPictureInPicture, setCanPictureInPicture] = useState(false)

  // Rendering the quality control. hls.js levels only; native HLS is not
  // listed (and the control stays hidden for single-level streams).
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([])
  const [qualityChoice, setQualityChoice] = useState<QualityChoice>(() =>
    readQualityChoice()
  )
  // True once buffering has lasted past the one-second indicator delay:
  // derived exclusively from the facts sampler, never from media events.
  const [isBuffering, setIsBuffering] = useState(false)
  // Non-null while the first play waits for the prebuffer target: drives
  // the "Preparing stream..." overlay with its progress bar and the
  // late "Play now" escape.
  const [prepare, setPrepare] = useState<{
    progress: number
    playNow: boolean
  } | null>(null)
  // Shown when a play() call was rejected (autoplay policy / gesture loss):
  // a visible tap starts the stream instead; never routed to failure.
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false)
  // One-shot, non-blocking suggestions about playback quality.
  const [banner, setBanner] = useState<"struggling" | "tooSlow" | null>(null)

  /** Mirror of the preset for the playback effect's sampler. */
  const choiceRef = useRef<QualityChoice>(qualityChoice)
  /** Mirror of the built quality list (set when the manifest parses). */
  const qualityLevelsRef = useRef<QualityLevel[]>([])
  /** Mirror of the engine choice (hls.js vs native playback). */
  const usingHlsRef = useRef(false)
  /** Until this instant the spinner must stay silent after our own actions. */
  const actionGraceUntilRef = useRef(0)
  /** State of the pre-first-play buffer hold (read by every overlay). */
  const prebufferRef = useRef<PrebufferState>(idlePrebuffer())
  /** True while the video is paused on purpose (prepare or refill hold). */
  const intentionalPauseRef = useRef(false)
  /** Last rebuffer pause; gates the one-per-cooldown rule. */
  const lastRebufferAtRef = useRef(0)
  /** Rolling timestamps of freeze episodes (one per reaction, newest last). */
  const stallTimesRef = useRef<number[]>([])
  /** One-shot guards: each suggestion shows at most once per channel. */
  const strugglingShownRef = useRef(false)
  const tooSlowShownRef = useRef(false)
  const dataSaverAppliedRef = useRef(false)

  /** Silent reconnects already attempted in the current incident. */
  const reconnectCountRef = useRef(0)
  /** Pending full-restart timer (survives the engine effect it was set in). */
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Consecutive fresh manifest attempts that ended in 403/404/410. */
  const manifestHttpFailuresRef = useRef(0)
  /** Completion times of full video-freeze ladder runs. */
  const frameFreezeRunsRef = useRef<number[]>([])
  /** No new video-freeze ladder may start before this instant. */
  const frameFreezeCooldownUntilRef = useRef(0)
  /** Dev-only frame-counter freeze deadline (`__simulateVideoFreeze`). */
  const simulatedFrameFreezeUntilRef = useRef(0)
  /** Last permanent-at-start reason (mixed content / unsupported format). */
  const startupErrorReasonRef = useRef<PlaybackErrorReason>("unsupportedFormat")
  /** A rebuild should autoplay only when the user had already started. */
  const autoplayOnRestartRef = useRef(false)
  /** The browser paused playback while the tab was hidden (not the user). */
  const pausedWhileHiddenRef = useRef(false)
  /** True after a rung-4 restart until frames prove the decoder recovered. */
  const frameRestartRecoveryRef = useRef(false)

  useEffect(() => {
    onPlaybackWorkingRef.current = onPlaybackWorking
    onPlaybackFailedRef.current = onPlaybackFailed
    onPlaybackActiveChangeRef.current = onPlaybackActiveChange
    onTryAnotherChannelRef.current = onTryAnotherChannel
    choiceRef.current = qualityChoice
  })

  // A playing stream keeps the screen awake (prevents the display falling
  // asleep mid-match); the hook releases it on pause/unmount/tab hide.
  useWakeLock(hasStarted && isPlaying && !error)

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }, [])

  /**
   * The one full-restart path shared by silent reconnects, the video-freeze
   * ladder's last rung and the "Try again" button: the keyed video element
   * and the engine effect are both replaced, so hls.js and the decoder are
   * genuinely fresh.
   */
  const scheduleFullRestart = useCallback(
    (delayMs: number) => {
      clearRestartTimer()

      const restart = () => {
        restartTimerRef.current = null
        setReloadToken((token) => token + 1)
      }

      if (delayMs <= 0) {
        restart()
        return
      }

      restartTimerRef.current = setTimeout(restart, delayMs)
    },
    [clearRestartTimer]
  )

  /** Rung 4 of the video-freeze ladder: restart at the live edge. */
  const requestFrameRestart = useCallback(() => {
    frameRestartRecoveryRef.current = true
    autoplayOnRestartRef.current = true
    debugLog("frame freeze ladder: restarting the player at the live edge")
    setIsReconnecting(true)
    setIsLoading(false)
    setAwaitingResume(false)
    setNeedsTapToPlay(false)
    setError("")
    scheduleFullRestart(0)
  }, [scheduleFullRestart])

  /**
   * Silent full reconnect with the 1/3/6 s delays. Returns false when the
   * budget is exhausted, which is the only temporary path to the error
   * screen.
   */
  const requestSilentReconnect = useCallback((): boolean => {
    if (restartTimerRef.current !== null) return true

    const attempt = reconnectCountRef.current
    if (attempt >= PLAYER_RECONNECT_MAX) return false

    reconnectCountRef.current = attempt + 1
    autoplayOnRestartRef.current = hasStartedRef.current

    const delay =
      PLAYER_RECONNECT_DELAYS_MS[
        Math.min(attempt, PLAYER_RECONNECT_DELAYS_MS.length - 1)
      ]

    debugLog(
      `silent reconnect ${attempt + 1}/${PLAYER_RECONNECT_MAX} scheduled in ${delay}ms`
    )

    setIsReconnecting(true)
    setIsLoading(false)
    setAwaitingResume(false)
    setNeedsTapToPlay(false)
    setError("")
    scheduleFullRestart(delay)

    return true
  }, [scheduleFullRestart])

  useEffect(() => clearRestartTimer, [clearRestartTimer])

  /** Resets the prebuffer hold: nothing is pending anymore. */
  const cancelPrebufferHold = useCallback(() => {
    if (prebufferRef.current.active) {
      prebufferRef.current = idlePrebuffer()
    }

    intentionalPauseRef.current = false
    startingRef.current = false
    queueMicrotask(() => setPrepare(null))
  }, [])

  /**
   * Fire-and-forget play used by both UI gestures and post-hold resumes.
   * A rejection here means the browser needs a fresh, visible tap — it is
   * surfaced as tap-to-play, never as a stream failure.
   */
  const gesturePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    void video.play().catch((err: unknown) => {
      if (isAbortError(err)) return

      debugLog(`play rejected: ${String(err)}`)
      setIsLoading(false)
      queueMicrotask(() => setNeedsTapToPlay(true))
    })
  }, [])

  /**
   * The port of entry for playback (the big red play button). Claims the
   * user-gesture autoplay right with an immediate play(), then parks the
   * playhead while the effect-side hold waits for the buffer target.
   */
  const startPlayback = useCallback(() => {
    if (startingRef.current) return

    const video = videoRef.current
    if (!video) return

    if (unsupportedRef.current) {
      const reason = startupErrorReasonRef.current
      debugLog(`error screen: kind=permanent reason=${reason} details=startup`)

      setHasStarted(true)
      setError(playbackErrorReasonText(reason))
      onPlaybackFailedRef.current?.()
      return
    }

    startingRef.current = true
    hasStartedRef.current = true
    setHasStarted(true)
    setStreamActive(true)
    setError("")
    setIsLoading(true)

    // Buffered-ahead target for this hold: 12 s when the saved bandwidth
    // estimate is below twice the start level's bitrate (deep first buffer
    // on slow links), 8 s otherwise; native HLS lets the browser steer and
    // uses the smaller target.
    const savedEstimate = readBandwidthEstimate()
    let target = PLAYER_PREBUFFER_TARGET_S

    if (usingHlsRef.current) {
      const display = qualityLevelsRef.current
      const startLevel = display.length > 0 ? display[display.length - 1] : null

      if (
        savedEstimate !== null &&
        startLevel !== null &&
        startLevel.bitrate > 0 &&
        savedEstimate < 2 * startLevel.bitrate
      ) {
        target = PLAYER_PREBUFFER_TARGET_LOW_BW_S
      }
    } else {
      target = PLAYER_PREBUFFER_TARGET_NATIVE_S
    }

    debugLog(`prepare hold started, target=${target}s / saved=${savedEstimate ?? "none"}`)

    prebufferRef.current = {
      active: true,
      startedAt: Date.now(),
      target,
      targetAdjusted: false,
      dropped: false,
    }

    // Claim the gesture for the real play that follows the hold, then
    // park the playhead at once. The pending play() promise is aborted by
    // our own pause() (AbortError — swallowed); the gesture credit stays.
    intentionalPauseRef.current = true

    video
      .play()
      .catch((err: unknown) => {
        if (isAbortError(err)) return

        debugLog(`startup play rejected: ${String(err)}`)

        // Autoplay policy wants a visible tap: offer it, do not fail.
        setIsLoading(false)
        setNeedsTapToPlay(true)
        cancelPrebufferHold()
      })

    video.pause()
  }, [cancelPrebufferHold])

  /** "Play now": start immediately with whatever has buffered so far. */
  const handlePlayNow = useCallback(() => {
    if (!prebufferRef.current.active) return

    debugLog("prepare hold: user chose Play now")
    prebufferRef.current = idlePrebuffer()
    intentionalPauseRef.current = false
    startingRef.current = false
    setPrepare(null)
    gesturePlay()
  }, [gesturePlay])

  /** Tap-to-play overlay: one visible tap retries playback directly. */
  const handleTapToPlay = useCallback(() => {
    setNeedsTapToPlay(false)
    startingRef.current = false
    hasStartedRef.current = true
    setHasStarted(true)
    setStreamActive(true)
    setIsLoading(true)
    gesturePlay()
  }, [gesturePlay])

  // The active stream takes priority over all background probing; unmount
  // and every stop signal are reported so probing can resume.
  useEffect(() => {
    onPlaybackActiveChangeRef.current?.(streamActive)
  }, [streamActive])

  useEffect(() => {
    return () => {
      onPlaybackActiveChangeRef.current?.(false)
    }
  }, [])

  // Fullscreen on tap, with a landscape lock on phones that support it.
  // iPhone Safari rejects element fullscreen; its video-only variant is the
  // fallback (native controls appear there).
  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
      return
    }

    try {
      const request = container.requestFullscreen()

      request
        .then(() => {
          const orientation = (screen as OrientationCapable).orientation

          orientation?.lock?.("landscape").catch(() => {})
        })
        .catch(() => {
          ;(videoRef.current as WebkitFullscreenVideo | null)?.webkitEnterFullscreen?.()
        })
    } catch {
      ;(videoRef.current as WebkitFullscreenVideo | null)?.webkitEnterFullscreen?.()
    }
  }, [])

  // Coming out of fullscreen restores the portrait orientation on phones.
  useEffect(() => {
    const onChange = () => {
      const active = document.fullscreenElement !== null
      setIsFullscreen(active)

      if (!active) {
        try {
          ;(screen as OrientationCapable).orientation?.unlock?.()
        } catch {
          // No orientation API: nothing to unlock.
        }
      }
    }

    document.addEventListener("fullscreenchange", onChange)

    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  // Picture-in-Picture is available on desktop Chrome/Safari and Android.
  useEffect(() => {
    if (
      typeof document === "undefined" ||
      document.pictureInPictureEnabled !== true
    ) {
      return
    }

    const available =
      typeof videoRef.current?.requestPictureInPicture === "function"

    queueMicrotask(() => setCanPictureInPicture(available))
  }, [])

  const togglePictureInPicture = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    try {
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {})
      } else {
        video.requestPictureInPicture().catch(() => {})
      }
    } catch {
      // Feature-not-available errors stay silent; the button is only shown
      // when the API exists.
    }
  }, [])

  /**
   * Engine wiring, the 250 ms facts sampler and every recovery action.
   * Re-runs per channel or retry; the cleanup reverses everything
   * (cancels holds, kills timers, destroys hls.js).
   */
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    let hls: Hls | null = null
    let cancelled = false
    let usingHls = false
    let workingReported = false
    let failureReported = false
    let reloading = false
    let restartScheduled = false
    let deliberatePauseUntil = 0
    let manifestFailureCounted = false

    const mixedContent =
      window.location.protocol === "https:" &&
      src.toLowerCase().startsWith("http://")

    // Recovery ladder state (shared by hls.js fatal errors and freeze
    // escalations), plus one-rung-per-wave burst protection.
    let ladderStep = 0
    let lastLadderAt = 0
    let ladderTimer: ReturnType<typeof setTimeout> | null = null

    /** Last classified failure, reused when the ladder runs out. */
    let lastFailureInput: PlaybackErrorInput = {
      engine: "hls",
      details: "bufferStalledError",
    }

    // Facts sampler state: progress baselines and the buffering streak.
    let lastSampledTime = video.currentTime
    /** Clock-freeze start (reset whenever the playhead moves again). */
    let frozenSince = Date.now()
    /** Last sample with progress AND enough data (spinner baseline). */
    let lastGoodAt = Date.now()
    let spinnerOn = false
    let sampleTick = 0
    /** Where a freeze episode stands: 1 held/nudged, 2 jumped, else ladder. */
    let freezeStreak = 0
    let lastTickAt = Date.now()

    // Rebuffer refill hold state.
    let rebufferActive = false
    let rebufferStartedAt = 0

    // Stability timers: ten seconds refresh the ladder and save bandwidth;
    // thirty seconds also reset the silent-reconnect budget.
    let stabilityTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectResetTimer: ReturnType<typeof setTimeout> | null = null

    let nativeResumeListener: (() => void) | null = null

    // Prebuffer overlay mirrors (state churn kept inside the sampler).
    let preparePct = -1
    let preparePlayNow = false

    // The level ABR lands on (drives the too-slow auto drop).
    let playingLevel = -1

    // Video-frame watchdog state.
    let lastFrameCount: number | null = null
    let frameProgressAt = Date.now()
    let frameEpisode: {
      rung: number
      checkAt: number
    } | null = null
    let frameEpisodeHiddenLogged = false
    let simulatedFrameCount: number | null = null
    let rvfcFrameCount = 0
    let rvfcHandle: number | null = null
    /** Last watchdog state, so only transitions reach the dev log. */
    let lastWatchdogNote = ""

    // True while the tab was hidden during active playback.
    let hiddenWhilePlaying = false

    /** A stall/freeze breaks the calm window that resets the retry budget. */
    const pauseReconnectReset = (reason: string) => {
      if (reconnectResetTimer === null) return

      clearTimeout(reconnectResetTimer)
      reconnectResetTimer = null
      debugLog(`stable-playback timer paused: ${reason}`)
    }

    const showSpinner = () => {
      if (spinnerOn) return

      spinnerOn = true
      setIsBuffering(true)
      pauseReconnectReset("buffering")
    }

    const hideSpinner = () => {
      if (!spinnerOn) return

      spinnerOn = false
      setIsBuffering(false)
    }

    /** Kicks hls.js fetching (harmless no-op without an active load). */
    const kickLoading = () => {
      try {
        if (usingHls && hls) hls.startLoad()
      } catch {
        // startLoad without an active run is a no-op.
      }
    }

    /** Tears down the prebuffer hold without touching the play state. */
    const stopPrebufferHold = () => {
      if (prebufferRef.current.active) {
        prebufferRef.current = idlePrebuffer()
      }

      intentionalPauseRef.current = false
      startingRef.current = false
      preparePct = -1
      preparePlayNow = false

      queueMicrotask(() => {
        if (!cancelled) setPrepare(null)
      })
    }

    /** Resumes playout after any deliberate hold (prepare or refill). */
    const resumeFromHold = () => {
      // One grace second while the decoder picks the new buffer up.
      actionGraceUntilRef.current = Date.now() + PLAYER_ACTION_GRACE_MS
      frozenSince = Date.now()
      lastGoodAt = Date.now()
      lastSampledTime = video.currentTime
      frameProgressAt = Date.now()
      hideSpinner()
      setIsLoading(false)
      gesturePlay()
    }

    const finishPrebuffer = (reason: "target" | "timeout") => {
      const pre = prebufferRef.current
      if (!pre.active) return

      debugLog(
        `prepare hold finished (${reason}) after ${Math.round(
          Date.now() - pre.startedAt
        )}ms, ${videoFacts(video)}`
      )

      stopPrebufferHold()
      resumeFromHold()
    }

    /** hls.js live edge, with the seekable end as a native fallback. */
    const liveEdgeTarget = (): number | null => {
      try {
        let target: number | null =
          usingHls && hls ? (hls.liveSyncPosition ?? null) : null

        if (target === null || !Number.isFinite(target)) {
          const seekable = video.seekable

          if (seekable.length > 0) {
            target =
              seekable.end(seekable.length - 1) - PLAYER_LIVE_EDGE_OFFSET_S
          }
        }

        return typeof target === "number" && Number.isFinite(target)
          ? target
          : null
      } catch {
        return null
      }
    }

    const jumpToLiveEdge = () => {
      const target = liveEdgeTarget()

      if (target !== null && target > video.currentTime) {
        try {
          video.currentTime = target
          return true
        } catch {
          // Seekers on detached or unsupported video elements throw; the
          // sampler escalates on a later episode instead.
        }
      }

      return false
    }

    /** After sleep/hidden/offline, jump only when genuinely far from live. */
    const seekToLiveEdgeIfFarBehind = (why: string): boolean => {
      const target = liveEdgeTarget()
      if (target === null) return false

      const behind = target - video.currentTime
      if (behind <= PLAYER_LIVE_BEHIND_MAX_S) return false

      debugLog(`${why}: ${behind.toFixed(1)}s behind live — seeking to the edge`)

      try {
        video.currentTime = target
        return true
      } catch {
        return false
      }
    }

    /**
     * Resume after an external interruption (online, tab visible, device
     * wake): refill, seek to live when far behind, then play if paused.
     */
    const resumeAfterInterruption = (why: string) => {
      if (cancelled || failureReported || restartScheduled) return
      if (restartTimerRef.current !== null) return
      if (!hasStartedRef.current || unsupportedRef.current) return
      if (prebufferRef.current.active || rebufferActive) return
      if (intentionalPauseRef.current) return

      pauseReconnectReset(why)
      actionGraceUntilRef.current = Date.now() + PLAYER_ACTION_GRACE_MS
      frozenSince = Date.now()
      lastGoodAt = Date.now()
      lastSampledTime = video.currentTime
      frameProgressAt = Date.now()
      kickLoading()
      seekToLiveEdgeIfFarBehind(why)

      if (video.paused || video.ended) {
        debugLog(`${why}: resuming paused playback, ${videoFacts(video)}`)
        setAwaitingResume(false)
        setIsLoading(true)
        setStreamActive(true)
        gesturePlay()
      }
    }

    /**
     * Caps playback one hls.js level lower than the effective cap (Auto:
     * the playing level; Data saver: the saver cap). A user-picked fixed
     * height is honored; nothing is persisted. Returns true when moved.
     */
    const dropQualityOneLevel = (why: string): boolean => {
      if (!usingHlsRef.current || typeof choiceRef.current === "object") {
        return false
      }

      const instance = hlsRef.current
      const display = qualityLevelsRef.current

      if (!instance || display.length < 2) return false

      const current =
        choiceRef.current === "saver"
          ? saverCapIndex(display)
          : playingLevel >= 0
            ? playingLevel
            : -1

      const position = display.findIndex((level) => level.index === current)
      // Display order is high → low; the next entry is one level lower.
      const lower = position >= 0 ? display[position + 1] : undefined

      if (!lower) return false

      try {
        instance.autoLevelCapping = lower.index
        instance.currentLevel = -1
      } catch {
        // A destroyed instance must not throw here.
        return false
      }

      debugLog(`quality drop (${why}): capped at ${lower.height}p`)
      return true
    }

    const samplePrebuffer = (now: number) => {
      const pre = prebufferRef.current
      const ahead = bufferedAheadSeconds(video)

      // The user forced playback (native controls): honor it, stop waiting.
      if (!video.paused) {
        debugLog(`prepare hold: play forced externally, ${ahead.toFixed(2)}s ahead`)
        stopPrebufferHold()
        return
      }

      const elapsed = now - pre.startedAt

      // Progress bar: buffered seconds over the target.
      const pct =
        pre.target > 0
          ? Math.min(100, Math.round((ahead / pre.target) * 100))
          : 100

      if (pct !== preparePct) {
        preparePct = pct
        setPrepare({ progress: pct / 100, playNow: preparePlayNow })
      }

      if (elapsed >= PLAYER_PREBUFFER_PLAY_NOW_AT_MS && !preparePlayNow) {
        preparePlayNow = true
        setPrepare({ progress: pct / 100, playNow: true })
      }

      // The fill is too slow: cap quality one level lower once, staying
      // inside the same max wait.
      if (
        !pre.targetAdjusted &&
        elapsed >= PLAYER_PREBUFFER_DROP_AT_MS &&
        ahead < pre.target * PLAYER_PREBUFFER_DROP_RATIO
      ) {
        pre.targetAdjusted = true

        if (dropQualityOneLevel(`prebuffer ${Math.round(ahead)}s of ${pre.target}s`)) {
          pre.dropped = true
          actionGraceUntilRef.current = now + PLAYER_ACTION_GRACE_MS
        }
      }

      if (ahead >= pre.target || elapsed >= PLAYER_PREBUFFER_MAX_WAIT_MS) {
        finishPrebuffer(ahead >= pre.target ? "target" : "timeout")
      }
    }

    const exitRebuffer = () => {
      rebufferActive = false
      intentionalPauseRef.current = false
    }

    const sampleRebuffer = (now: number) => {
      const ahead = bufferedAheadSeconds(video)

      // A play we did not start (user hit the native control) wins.
      if (!video.paused) {
        debugLog(`rebuffer interrupted by external play, ${ahead.toFixed(2)}s ahead`)
        exitRebuffer()
        return
      }

      if (
        ahead >= PLAYER_REBUFFER_TARGET_S ||
        now - rebufferStartedAt >= PLAYER_REBUFFER_MAX_WAIT_MS
      ) {
        exitRebuffer()
        resumeFromHold()
        return
      }
    }

    /** Deliberate refill hold after a confirmed freeze episode. */
    const enterRebuffer = (now: number) => {
      debugLog("rebuffer: pausing the playhead to refill the buffer")
      rebufferActive = true
      rebufferStartedAt = now
      lastRebufferAtRef.current = now
      intentionalPauseRef.current = true

      // The freeze already ran longer than the indicator delay, so the
      // "Buffering..." spinner shows immediately and hides again the
      // instant frames advance.
      showSpinner()
      kickLoading()
      video.pause()
    }

    /**
     * Counts one stall per freeze episode (first reaction only) and drives
     * the one-shot suggestions. The analyzer is hls.js-only: native HLS
     * exposes no levels, so Data saver cannot be honored there.
     */
    const recordStall = (now: number) => {
      if (!usingHlsRef.current || tooSlowShownRef.current) return

      const times = stallTimesRef.current
      times.push(now)

      while (times.length > 0 && now - times[0] > PLAYER_STALL_WINDOW_MS) {
        times.shift()
      }

      if (times.length < PLAYER_STALL_COUNT_LIMIT) return

      const choice = choiceRef.current
      const atFloor =
        choice === "saver" ||
        (typeof choice === "object" &&
          qualityLevelsRef.current.find(
            (level) => level.height === choice.height
          )?.index === 0) ||
        (choice === "auto" && hlsRef.current?.currentLevel === 0)

      if (strugglingShownRef.current) {
        // The suggestion was already shown; only users who applied Data
        // saver and kept freezing escalate to the honest message.
        if (dataSaverAppliedRef.current) {
          tooSlowShownRef.current = true
          setBanner("tooSlow")
        }

        return
      }

      if (atFloor) {
        tooSlowShownRef.current = true
        setBanner("tooSlow")
        return
      }

      strugglingShownRef.current = true
      setBanner("struggling")
    }

    /** Gentle first aid when the refill hold is on cooldown. */
    const nudgePlayback = () => {
      kickLoading()

      try {
        video.currentTime += 0.25
      } catch {
        // Seek failures are retried as an edge jump later.
      }

      actionGraceUntilRef.current = Date.now() + PLAYER_ACTION_GRACE_MS
    }

    /** Tears down the pending ladder rung (used when playback is fine). */
    const disarmLadder = () => {
      if (ladderTimer !== null) {
        clearTimeout(ladderTimer)
        ladderTimer = null
      }
    }

    const clearStabilityTimers = () => {
      if (stabilityTimer !== null) {
        clearTimeout(stabilityTimer)
        stabilityTimer = null
      }

      if (reconnectResetTimer !== null) {
        clearTimeout(reconnectResetTimer)
        reconnectResetTimer = null
      }
    }

    /**
     * (Re)starts the calm window that clears the reconnect/freeze budgets.
     * Only healthy playback calls this; pauses, stalls and freezes cancel it.
     */
    const scheduleReconnectReset = () => {
      if (reconnectResetTimer !== null) clearTimeout(reconnectResetTimer)

      reconnectResetTimer = setTimeout(() => {
        reconnectResetTimer = null

        if (cancelled) return

        // The window may have started just before a silent frame freeze;
        // never reset the budgets while the picture is stale.
        if (
          lastFrameCount !== null &&
          video.videoWidth > 0 &&
          Date.now() - frameProgressAt >= PLAYER_FRAME_FREEZE_MS
        ) {
          debugLog("stable window skipped: frames stopped before it expired")
          return
        }

        reconnectCountRef.current = 0
        manifestHttpFailuresRef.current = 0
        frameFreezeRunsRef.current = []
        frameRestartRecoveryRef.current = false
        debugLog(
          `${PLAYER_RECONNECT_STABLE_RESET_MS / 1000}s stable: reconnect and freeze counters reset`
        )
      }, PLAYER_RECONNECT_STABLE_RESET_MS)
    }

    /**
     * The only place the error screen is shown. Calls the dashboard's
     * failure report exactly once, after every recovery path is exhausted.
     */
    const failNow = (input: PlaybackErrorInput) => {
      if (cancelled || failureReported) return

      const classification = classifyPlaybackError(input)
      debugLog(
        `error screen: kind=${classification.kind} reason=${classification.reason} ` +
          `details=${input.details ?? "none"} status=${input.httpStatus ?? "none"}`
      )

      failureReported = true
      restartScheduled = true
      disarmLadder()
      clearStabilityTimers()
      exitRebuffer()
      stopPrebufferHold()
      hideSpinner()
      frameEpisode = null
      deliberatePauseUntil = 0

      setIsReconnecting(false)
      setIsLoading(false)
      setIsPlaying(false)
      setStreamActive(false)
      setAwaitingResume(false)
      setNeedsTapToPlay(false)
      setError(playbackErrorReasonText(classification.reason))
      video.pause()

      // Every quality action reads the shared ref; a destroyed instance
      // must not be reachable from there.
      hls?.destroy()
      hls = null
      hlsRef.current = null

      onPlaybackFailedRef.current?.()
    }

    const reloadHlsAtLiveEdge = () => {
      reloading = true
      actionGraceUntilRef.current = Date.now() + PLAYER_ACTION_GRACE_MS
      // A pause caused by the reload itself is not a user pause.
      deliberatePauseUntil = Date.now() + PLAYER_ACTION_GRACE_MS

      try {
        hls?.stopLoad()
        hls?.loadSource(src)
        // `startLoad(-1)`: begin at the live edge instead of the old
        // (probably frozen) buffer position.
        hls?.startLoad(-1)
      } catch {
        // A reload racing teardown is harmless; the next error escalates.
      }
    }

    const reloadNativeSource = () => {
      reloading = true
      actionGraceUntilRef.current = Date.now() + PLAYER_ACTION_GRACE_MS
      // The queued pause event from load() must not look like a user pause.
      deliberatePauseUntil = Date.now() + PLAYER_ACTION_GRACE_MS

      // Reassigning and loading cancels any pending request native
      // playback still had open. Our own pause: not a user pause.
      intentionalPauseRef.current = true
      video.pause()
      video.src = src
      video.load()
      intentionalPauseRef.current = false

      // The former buffer position is gone; resume from the fresh edge.
      const resume = () => {
        if (cancelled || failureReported || restartScheduled) return

        gesturePlay()
      }

      if (nativeResumeListener !== null) {
        video.removeEventListener("loadedmetadata", nativeResumeListener)
      }

      nativeResumeListener = resume
      video.addEventListener("loadedmetadata", resume, { once: true })
    }

    /**
     * Temporary failures: silent full reconnect while the budget lasts,
     * only then the error screen. Permanent failures never reach here.
     */
    const handleLadderExhausted = () => {
      if (cancelled || failureReported || restartScheduled) return

      const classification = classifyPlaybackError(lastFailureInput)
      debugLog(
        `ladder exhausted: kind=${classification.kind} reason=${classification.reason}`
      )

      if (classification.kind === "permanent") {
        failNow(lastFailureInput)
        return
      }

      if (!requestSilentReconnect()) {
        debugLog(
          `silent reconnects exhausted (${reconnectCountRef.current}/${PLAYER_RECONNECT_MAX}); showing the error screen`
        )
        failNow(lastFailureInput)
        return
      }

      // Stop the old engine now; the timer owns the fresh one. The stream
      // stays "active" so background probing does not resume mid-reconnect.
      restartScheduled = true
      disarmLadder()
      clearStabilityTimers()
      exitRebuffer()
      stopPrebufferHold()
      hideSpinner()
      frameEpisode = null
      setIsLoading(false)
      setIsPlaying(false)
      setAwaitingResume(false)
      setNeedsTapToPlay(false)
      // The restart owns the next play; this pause must not look like a
      // user pause to the probing lifecycle.
      intentionalPauseRef.current = true
      video.pause()

      hls?.destroy()
      hls = null
      hlsRef.current = null
    }

    /** Consumes the next rung of the recovery ladder. */
    const consumeLadderStep = () => {
      if (cancelled || failureReported || restartScheduled) return

      if (!usingHls) {
        // Native HLS: nudge and edge-seek already ran; the platform offers
        // nothing beyond a few fresh source loads.
        if (ladderStep < NATIVE_LADDER_STEP_COUNT) {
          ladderStep += 1
          reloadNativeSource()
        } else {
          handleLadderExhausted()
        }

        return
      }

      switch (ladderStep) {
        case 0:
          ladderStep = 1
          try {
            hls?.startLoad()
          } catch {
            // Already started; the next error advances the ladder.
          }
          break
        case 1:
          ladderStep = 2
          try {
            hls?.recoverMediaError()
          } catch {
            // Nothing recoverable; the next error advances the ladder.
          }
          break
        case 2:
          ladderStep = 3
          try {
            hls?.swapAudioCodec()
            hls?.recoverMediaError()
          } catch {
            // Nothing recoverable; the next error advances the ladder.
          }
          break
        case 3:
          ladderStep = 4
          reloadHlsAtLiveEdge()
          break
        default:
          handleLadderExhausted()
          break
      }
    }

    /**
     * Queues one ladder rung per error wave, waiting out the grace window
     * first: senders of independent transports fire several fatal errors
     * for a single failure, and they must cost a single step — not skip
     * the ladder straight to "failed".
     */
    const armLadderStep = () => {
      const now = Date.now()
      const wait = Math.max(0, PLAYER_LADDER_GRACE_MS - (now - lastLadderAt))

      if (ladderTimer !== null) return

      ladderTimer = setTimeout(() => {
        ladderTimer = null
        lastLadderAt = Date.now()
        consumeLadderStep()
      }, wait)
    }

    const handleFreezeEpisode = (now: number) => {
      debugLog(`freeze episode ${freezeStreak + 1} confirmed, ${videoFacts(video)}`)
      pauseReconnectReset("playhead freeze")

      if (freezeStreak === 0) {
        freezeStreak = 1
        recordStall(now)

        // One refill pause per cooldown window; a later freeze inside the
        // window rides the nudge instead of a pause-resume loop.
        if (now - lastRebufferAtRef.current >= PLAYER_REBUFFER_COOLDOWN_MS) {
          enterRebuffer(now)
        } else {
          debugLog("freeze: refill hold on cooldown — nudging instead")
          nudgePlayback()
        }

        return
      }

      if (freezeStreak === 1) {
        // The refill did not unstick the decoder: jump the playout to the
        // live edge, leaving the frozen buffer position behind.
        freezeStreak = 2
        kickLoading()
        jumpToLiveEdge()
        actionGraceUntilRef.current = Date.now() + PLAYER_ACTION_GRACE_MS

        return
      }

      // Still frozen after the jump: escalate into the recovery ladder,
      // which ends in the failure report if nothing works. The rung fires
      // after the grace window so the reload wave settles first.
      freezeStreak = 0
      lastFailureInput = {
        engine: usingHls ? "hls" : "native",
        details: usingHls ? "bufferStalledError" : undefined,
      }
      armLadderStep()
    }

    // ---------------------------------------------------------------------
    // Video-frame freeze watchdog
    // ---------------------------------------------------------------------

    /** Reads the presented-frame counter, honoring the dev simulation. */
    const frameCountNow = (): number | null => {
      const qualityFrames = videoFrameCount(video)
      const raw = qualityFrames ?? (rvfcHandle !== null ? rvfcFrameCount : null)

      if (raw === null) return null

      if (simulatedFrameFreezeUntilRef.current <= Date.now()) {
        simulatedFrameCount = null
        return raw
      }

      if (simulatedFrameCount === null) simulatedFrameCount = raw

      return simulatedFrameCount
    }

    /**
     * Dev diagnostics: one line per watchdog state change, so a log shows
     * why the frame check is idle instead of repeating the same reason
     * every 250 ms.
     */
    const noteFrameWatchdog = (reason: string) => {
      if (lastWatchdogNote === reason) return

      lastWatchdogNote = reason
      debugLog(`frame watchdog: ${reason}, ${videoFacts(video)}`)
    }

    /** Full ladder runs still inside the rolling window (oldest first). */
    const activeFrameRuns = (now: number): number[] => {
      const runs = frameFreezeRunsRef.current

      while (
        runs.length > 0 &&
        now - runs[0] > PLAYER_FRAME_FREEZE_RUN_WINDOW_MS
      ) {
        runs.shift()
      }

      return runs
    }

    const frameFailureInput = (): PlaybackErrorInput => ({
      engine: usingHls ? "hls" : "native",
      details: usingHls ? "bufferStalledError" : undefined,
    })

    /**
     * The frame ladder gives up: silent reconnect while the budget lasts,
     * then the error screen. The current engine is stopped immediately so
     * its frozen audio does not play under the "Reconnecting..." overlay.
     */
    const handOffToSilentReconnect = () => {
      restartScheduled = true

      if (!requestSilentReconnect()) {
        failNow(frameFailureInput())
        return
      }

      disarmLadder()
      clearStabilityTimers()
      hideSpinner()
      frameEpisode = null
      setIsLoading(false)
      setIsPlaying(false)
      intentionalPauseRef.current = true
      video.pause()

      hls?.destroy()
      hls = null
      hlsRef.current = null
    }

    const recoverFrameFreeze = (now: number) => {
      if (!frameEpisode) return

      debugLog(
        `frame freeze recovered after rung ${frameEpisode.rung} ` +
          `(cooldown ${PLAYER_FRAME_FREEZE_COOLDOWN_MS}ms), ${videoFacts(video)}`
      )

      frameFreezeCooldownUntilRef.current =
        now + PLAYER_FRAME_FREEZE_COOLDOWN_MS
      frameEpisode = null
      frameEpisodeHiddenLogged = false
      lastWatchdogNote = ""
      frozenSince = now
      lastGoodAt = now
      hideSpinner()
      actionGraceUntilRef.current = now + PLAYER_ACTION_GRACE_MS
      scheduleReconnectReset()
    }

    const runFrameRung = (rung: number) => {
      if (rung === 1) {
        debugLog(
          `frame freeze rung 1: tiny seek +${PLAYER_FRAME_FREEZE_SEEK_S}s, ${videoFacts(video)}`
        )

        try {
          video.currentTime += PLAYER_FRAME_FREEZE_SEEK_S
        } catch {
          // The next rung does not depend on the seek succeeding.
        }

        return
      }

      if (rung === 2) {
        debugLog(`frame freeze rung 2: pause/play, ${videoFacts(video)}`)
        // The pause event is queued, so keep it classified as deliberate
        // for a moment even if play() resolves first.
        deliberatePauseUntil = Date.now() + PLAYER_ACTION_GRACE_MS
        video.pause()

        void video.play().catch((err: unknown) => {
          if (isAbortError(err)) return

          debugLog(`frame rung 2 play rejected: ${String(err)}`)
          queueMicrotask(() => setNeedsTapToPlay(true))
        })

        return
      }

      if (rung === 3) {
        if (usingHls) {
          debugLog(`frame freeze rung 3: recoverMediaError, ${videoFacts(video)}`)

          try {
            hls?.recoverMediaError()
          } catch {
            // The restart rung still follows if this was ineffective.
          }
        } else {
          debugLog(`frame freeze rung 3: native source reload, ${videoFacts(video)}`)
          reloadNativeSource()
        }
      }
    }

    const finishFrameLadderRun = (now: number) => {
      frameEpisode = null
      frameEpisodeHiddenLogged = false

      const runs = activeFrameRuns(now)
      runs.push(now)

      debugLog(
        `frame freeze ladder run ${runs.length}/${PLAYER_FRAME_FREEZE_MAX_RUNS} ` +
          `in ${PLAYER_FRAME_FREEZE_RUN_WINDOW_MS / 1000}s`
      )

      if (runs.length >= PLAYER_FRAME_FREEZE_MAX_RUNS) {
        debugLog("frame freeze ladder exhausted — switching to silent reconnect")
        handOffToSilentReconnect()
        return
      }

      restartScheduled = true
      requestFrameRestart()
    }

    const advanceFrameEpisode = (now: number) => {
      if (!frameEpisode) return

      if (document.hidden) {
        if (!frameEpisodeHiddenLogged) {
          frameEpisodeHiddenLogged = true
          debugLog("frame freeze rung check deferred: document hidden")
        }

        frameEpisode.checkAt = now + PLAYER_FRAME_FREEZE_RECOVERY_CHECK_MS
        return
      }

      const nextRung = frameEpisode.rung + 1
      frameEpisode.rung = nextRung
      frameEpisode.checkAt = now + PLAYER_FRAME_FREEZE_RECOVERY_CHECK_MS
      actionGraceUntilRef.current = now + PLAYER_FRAME_FREEZE_RECOVERY_CHECK_MS

      if (nextRung >= 4) {
        debugLog(
          `frame freeze rung 3 did not restore frames: restarting, ${videoFacts(video)}`
        )
        finishFrameLadderRun(now)
        return
      }

      debugLog(
        `frame freeze still present after ${PLAYER_FRAME_FREEZE_RECOVERY_CHECK_MS}ms: rung ${nextRung}`
      )
      runFrameRung(nextRung)
    }

    const startFrameEpisode = (now: number) => {
      pauseReconnectReset("frame freeze")

      if (now < frameFreezeCooldownUntilRef.current) {
        debugLog(
          `frame freeze seen during cooldown (${Math.round(
            frameFreezeCooldownUntilRef.current - now
          )}ms left) — waiting`
        )
        frameProgressAt = now
        return
      }

      const runs = activeFrameRuns(now)

      if (runs.length >= PLAYER_FRAME_FREEZE_MAX_RUNS) {
        debugLog(
          `frame freeze with ${runs.length} full ladder runs in the window — silent reconnect`
        )
        handOffToSilentReconnect()

        return
      }

      debugLog(
        `frame freeze confirmed: no new frames for ${PLAYER_FRAME_FREEZE_MS}ms, ` +
          `${videoFacts(video)}`
      )

      frameEpisode = {
        rung: 1,
        checkAt: now + PLAYER_FRAME_FREEZE_RECOVERY_CHECK_MS,
      }
      frameEpisodeHiddenLogged = false
      actionGraceUntilRef.current = now + PLAYER_FRAME_FREEZE_RECOVERY_CHECK_MS
      runFrameRung(1)
    }

    /**
     * The playback heartbeat: samples element facts (~250 ms). The freeze
     * ladders, the frame watchdog and the buffering spinner all derive
     * from it — never from media events.
     */
    const sample = () => {
      if (cancelled || failureReported || restartScheduled) return

      const now = Date.now()
      const t = video.currentTime

      sampleTick += 1

      const tickGap = now - lastTickAt
      lastTickAt = now

      // A huge gap between ticks while visible is the signature of a
      // sleeping device; treat it as a wake-up and reconnect playback.
      if (tickGap > PLAYER_WAKE_GAP_MS && !document.hidden) {
        debugLog(`watchdog gap ${tickGap}ms — assuming device wake`)
        resumeAfterInterruption("device wake")
      }

      // Mode 1: the tap gesture is parked and the buffer is filling.
      if (prebufferRef.current.active) {
        if (sampleTick % 4 === 0) {
          debugLog(`sampler[prepare] paused=${video.paused} ${videoFacts(video)}`)
        }

        samplePrebuffer(now)
        return
      }

      // Mode 2: deliberate refill hold in progress after a freeze.
      if (rebufferActive) {
        if (sampleTick % 4 === 0) {
          debugLog(`sampler[rebuffer] paused=${video.paused} ${videoFacts(video)}`)
        }

        sampleRebuffer(now)
        return
      }

      // Frame counters are sampled even outside playback so a pause never
      // leaves a stale baseline behind.
      const frameCount = frameCountNow()

      if (frameCount !== null) {
        if (lastFrameCount === null) {
          lastFrameCount = frameCount
        } else if (frameCount > lastFrameCount) {
          lastFrameCount = frameCount
          frameProgressAt = now

          if (frameRestartRecoveryRef.current) {
            frameRestartRecoveryRef.current = false
            frameFreezeCooldownUntilRef.current =
              now + PLAYER_FRAME_FREEZE_COOLDOWN_MS
            debugLog(
              `frame freeze ladder rung 4 recovered; ${PLAYER_FRAME_FREEZE_COOLDOWN_MS}ms cooldown`
            )
          }

          if (frameEpisode) recoverFrameFreeze(now)
        } else if (frameCount < lastFrameCount) {
          // A new media resource restarted the counter.
          lastFrameCount = frameCount
          frameProgressAt = now
        }
      }

      // Active frame episode: check every tick until frames resume or the
      // next rung is due. It deliberately ignores the action grace so the
      // 2.5 s checks stay on schedule.
      if (frameEpisode) {
        if (document.hidden) {
          if (!frameEpisodeHiddenLogged) {
            frameEpisodeHiddenLogged = true
            debugLog("frame freeze rung check deferred: document hidden")
          }

          frameEpisode.checkAt = now + PLAYER_FRAME_FREEZE_RECOVERY_CHECK_MS
          return
        }

        if (now >= frameEpisode.checkAt) advanceFrameEpisode(now)

        if (sampleTick % 4 === 0) {
          debugLog(
            `sampler[frame-freeze] rung=${frameEpisode?.rung ?? 4} ` +
              `frames=${frameCount ?? "n/a"} ${videoFacts(video)}`
          )
        }

        return
      }

      // Mode 3: facts-based playout sampling.
      const grace = actionGraceUntilRef.current - now
      const idleReason = !hasStartedRef.current
        ? "not started"
        : unsupportedRef.current
          ? "unsupported source"
          : reloading
            ? "reload in progress"
            : video.paused
              ? "paused"
              : video.seeking
                ? "seeking"
                : video.ended
                  ? "ended"
                  : grace > 0
                    ? "action grace"
                    : null

      if (idleReason !== null) {
        noteFrameWatchdog(`idle: ${idleReason}`)
        frozenSince = now
        lastGoodAt = now
        lastSampledTime = t
        frameProgressAt = now
        hideSpinner()
        return
      }

      noteFrameWatchdog("monitoring frames while the playhead advances")

      const delta = t - lastSampledTime
      lastSampledTime = t
      const timeAdvanced = delta >= 0.05

      // Freeze detection keeps its own pure-clock baseline.
      if (timeAdvanced) frozenSince = now

      // Buffering facts: progress AND enough data.
      if (timeAdvanced && video.readyState >= 3) {
        lastGoodAt = now

        if (spinnerOn) {
          debugLog(
            `buffering cleared: playhead advanced ${delta.toFixed(2)}s, ${videoFacts(video)}`
          )
          hideSpinner()
        }
      } else if (!spinnerOn && now - lastGoodAt >= PLAYER_BUFFERING_DELAY_MS) {
        debugLog(
          `buffering confirmed after ${Math.round(now - lastGoodAt)}ms, ${videoFacts(video)}`
        )
        showSpinner()
      }

      // If a hold or freeze interrupted the previous calm window, the
      // first healthy tick starts a fresh thirty-second count.
      if (
        reconnectResetTimer === null &&
        timeAdvanced &&
        video.readyState >= 3 &&
        !spinnerOn &&
        (reconnectCountRef.current > 0 || frameFreezeRunsRef.current.length > 0) &&
        (frameCount === null || now - frameProgressAt < PLAYER_FRAME_FREEZE_MS)
      ) {
        scheduleReconnectReset()
      }

      if (now - frozenSince >= PLAYER_FREEZE_CHECK_MS) {
        frozenSince = now
        handleFreezeEpisode(now)

        return
      }

      // The audio can keep the clock advancing while the decoder presents
      // no new picture. Only the frame counter can see that failure.
      if (timeAdvanced) {
        const frameAge = now - frameProgressAt

        if (frameAge >= PLAYER_FRAME_FREEZE_MS && spinnerOn) {
          frameProgressAt = now
          noteFrameWatchdog("waiting: buffering")
        } else if (frameAge >= PLAYER_FRAME_FREEZE_MS && document.hidden) {
          frameProgressAt = now
          noteFrameWatchdog("waiting: tab hidden")
        } else if (frameAge >= PLAYER_FRAME_FREEZE_MS && video.videoWidth === 0) {
          frameProgressAt = now
          noteFrameWatchdog("waiting: audio-only")
        } else if (frameCount === null) {
          noteFrameWatchdog("unavailable: no frame counter")
        } else if (frameAge >= PLAYER_FRAME_FREEZE_MS) {
          const inPictureInPicture =
            document.pictureInPictureElement === video

          if (inPictureInPicture && (lastFrameCount ?? 0) === 0) {
            frameProgressAt = now
            noteFrameWatchdog("skipped: Picture-in-Picture without frames")
          } else {
            noteFrameWatchdog(
              "confirmed: frames stopped while the playhead advanced"
            )
            startFrameEpisode(now)
          }
        }
      }

      if (sampleTick % 4 === 0) {
        debugLog(
          `sampler: buffering=${spinnerOn} goodAgo=${Math.round(now - lastGoodAt)}ms ` +
            `frames=${frameCount ?? "n/a"} frameAge=${Math.round(now - frameProgressAt)}ms ` +
            `${videoFacts(video)}`
        )
      }
    }

    const onPlaying = () => {
      debugLog(`event playing, ${videoFacts(video)}`)

      if (!workingReported) {
        workingReported = true
        onPlaybackWorkingRef.current?.()
      }

      // A reload or a held resume arriving alive earns a fresh grace.
      if (reloading) {
        actionGraceUntilRef.current = Date.now() + PLAYER_ACTION_GRACE_MS
      }

      reloading = false
      pausedWhileHiddenRef.current = false
      freezeStreak = 0
      lastSampledTime = video.currentTime
      frozenSince = Date.now()
      lastGoodAt = Date.now()
      lastTickAt = Date.now()
      frameProgressAt = Date.now()
      lastFrameCount = null
      hideSpinner()
      setNeedsTapToPlay(false)
      setAwaitingResume(false)
      setIsReconnecting(false)
      setIsPlaying(true)
      setStreamActive(true)
      setIsLoading(false)
      setError("")

      // Ten calm seconds refresh the recovery ladder for the next
      // incident and persist the measured bandwidth for future boots.
      if (stabilityTimer !== null) clearTimeout(stabilityTimer)

      stabilityTimer = setTimeout(() => {
        stabilityTimer = null
        ladderStep = 0

        if (!cancelled && usingHls && hls) {
          writeBandwidthEstimate(hls.bandwidthEstimate)
          debugLog(`bandwidth estimate saved: ${Math.round(hls.bandwidthEstimate)}bps`)
        }
      }, PLAYER_ESTIMATE_SAVE_DELAY_MS)

      // Thirty genuinely calm seconds prove the reconnect was not a false
      // alarm; buffering and freeze detection cancel this window.
      scheduleReconnectReset()
    }

    const onWaiting = () => {
      debugLog(`event waiting, ${videoFacts(video)}`)

      // A hint only: sample sooner; the facts decide the spinner.
      sample()
    }

    const onCanPlay = () => {
      debugLog(`event canplay, ${videoFacts(video)}`)

      // Deliberately does NOT clear the buffering spinner: a canplay
      // under a stuck playhead is still stuck. Facts hide the spinner.
      setIsLoading(false)
      sample()
    }

    const onStalled = () => {
      debugLog(`event stalled, ${videoFacts(video)}`)

      // A hint only, same as waiting.
      sample()
    }

    const onPause = () => {
      const deliberatePause = Date.now() < deliberatePauseUntil

      debugLog(
        `event pause intentional=${intentionalPauseRef.current || deliberatePause} ` +
          `ended=${video.ended} ${videoFacts(video)}`
      )

      // Our own holds (prepare/refill), the pause/play rung and reloads are
      // not user pauses: probing stays silent and no Resume overlay appears.
      if (intentionalPauseRef.current || deliberatePause) {
        setIsPlaying(false)
        return
      }

      if (document.hidden && !failureReported) {
        pausedWhileHiddenRef.current = true
      }

      frameEpisode = null
      setIsPlaying(false)
      setStreamActive(false)
      hideSpinner()
      clearStabilityTimers()
    }

    const onEnded = () => {
      debugLog(`event ended, ${videoFacts(video)}`)

      stopPrebufferHold()
      exitRebuffer()
      frameEpisode = null

      setIsPlaying(false)
      setStreamActive(false)
      setAwaitingResume(true)
      hideSpinner()
      clearStabilityTimers()
    }

    const onSeeking = () => {
      debugLog(`event seeking, ${videoFacts(video)}`)
      pauseReconnectReset("seeking")
      frameProgressAt = Date.now()
    }

    const onSeeked = () => {
      debugLog(`event seeked, ${videoFacts(video)}`)
      frameProgressAt = Date.now()
      sample()
    }

    const onVideoError = () => {
      if (cancelled || failureReported || restartScheduled || !video.error) {
        return
      }

      const code = video.error.code
      debugLog(`event error code=${code} ${video.error.message}`)

      // MEDIA_ERR_ABORTED is the normal by-product of our own reloads.
      if (code === 1) {
        debugLog("video error aborted (ignored)")
        return
      }

      const input: PlaybackErrorInput = usingHls
        ? {
            engine: "hls",
            hlsType: "mediaError",
            details: "bufferAppendError",
          }
        : { engine: "native", nativeErrorCode: code }

      lastFailureInput = input

      const classification = classifyPlaybackError(input)
      debugLog(
        `video error classified: kind=${classification.kind} reason=${classification.reason}`
      )

      // A genuinely unsupported source is permanent; fetch/decode hiccups
      // still walk the ladder and the silent reconnects.
      if (classification.kind === "permanent") {
        failNow(input)
        return
      }

      armLadderStep()
    }

    const onOnline = () => {
      debugLog("event online")
      resumeAfterInterruption("online")
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenWhilePlaying =
          (!video.paused && !video.ended) || pausedWhileHiddenRef.current
        debugLog(
          `event visibility hidden, playing=${hiddenWhilePlaying} ${videoFacts(video)}`
        )
        return
      }

      debugLog(`event visibility visible, ${videoFacts(video)}`)

      if (hiddenWhilePlaying || pausedWhileHiddenRef.current) {
        resumeAfterInterruption("tab visible")
      }

      hiddenWhilePlaying = false
      pausedWhileHiddenRef.current = false
    }

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return

      debugLog("event pageshow from bfcache")
      resumeAfterInterruption("page restore")
    }

    const autoPlay = () => {
      if (reloadToken === 0 || !autoplayOnRestartRef.current) return

      debugLog("retry autostart")
      // A fresh player always rejoins at the live edge, not the old buffer.
      jumpToLiveEdge()
      gesturePlay()
    }

    video.addEventListener("playing", onPlaying)
    video.addEventListener("waiting", onWaiting)
    video.addEventListener("canplay", onCanPlay)
    video.addEventListener("stalled", onStalled)
    video.addEventListener("pause", onPause)
    video.addEventListener("ended", onEnded)
    video.addEventListener("error", onVideoError)
    video.addEventListener("seeking", onSeeking)
    video.addEventListener("seeked", onSeeked)

    window.addEventListener("online", onOnline)
    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("pageshow", onPageShow)

    if (mixedContent) {
      usingHls = false
      usingHlsRef.current = false
      hlsRef.current = null
      unsupportedRef.current = true
      startupErrorReasonRef.current = "mixedContent"
      debugLog("engine: blocked — mixed content (https page, http stream)")
    } else if (hasNativeHlsSupport(video)) {
      usingHls = false
      usingHlsRef.current = false
      hlsRef.current = null
      lastFailureInput = { engine: "native" }

      // Pre-tap download for the prebuffer hold on native; the browser
      // owns the buffering strategy, so only the load hint is set.
      video.preload = "auto"

      if (reloadToken > 0) {
        video.addEventListener("loadedmetadata", autoPlay, { once: true })
      }

      debugLog("engine: native HLS")
      video.src = src
      video.load()
    } else if (Hls.isSupported()) {
      usingHls = true
      usingHlsRef.current = true
      lastFailureInput = { engine: "hls", details: "bufferStalledError" }
      debugLog("engine: hls.js")

      hls = new Hls(buildPlayerHlsConfig(readBandwidthEstimate()))
      hlsRef.current = hls

      hls.loadSource(src)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const display = chooseDisplayLevels(data.levels)

        manifestFailureCounted = false
        manifestHttpFailuresRef.current = 0

        // Available for the quality control and the stall analyzer.
        qualityLevelsRef.current = display
        queueMicrotask(() => {
          if (!cancelled) setQualityLevels(display)
        })

        // Boot with the remembered preset before the first fragment hits
        // the network, so the stream starts at the right rendition.
        applyQualityChoice(readQualityChoice(), hls, display)

        debugLog(`hls manifest parsed with ${display.length} renditions`)

        // First visit: the tap-gesture hold decides when to play.
        // Recovery retries start at the live edge by themselves.
        if (reloadToken > 0) {
          try {
            hls?.startLoad(-1)
          } catch {
            // A manifest parsed during teardown is harmless.
          }

          autoPlay()
        }
      })

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        playingLevel = data.level
        debugLog(`hlsLevelSwitched index=${data.level}`)
      })

      hls.on(Hls.Events.FRAG_BUFFERED, (_event, data) => {
        debugLog(
          `hlsFragBuffered sn=${String(data.frag.sn)}, ${videoFacts(video)}`
        )

        // Buffered data is the fastest prebuffer progress signal.
        sample()
      })

      hls.on(Hls.Events.ERROR, (_event, data) => {
        const status = errorHttpStatus(data)
        const failingUrl = data.url ?? data.response?.url ?? data.frag?.url ?? src
        const host = urlHost(failingUrl)

        // Logged before the guards: during a silent reconnect the old
        // instance can still report errors, and a device log should show
        // everything that arrived.
        debugLog(
          `hls error type=${data.type} details=${data.details} fatal=${data.fatal} ` +
            `status=${status ?? "none"} host=${host} ${videoFacts(video)}`
        )

        if (cancelled || failureReported || restartScheduled) {
          const ignored = cancelled
            ? "effect cancelled"
            : failureReported
              ? "failure already reported"
              : "restart scheduled"

          debugLog(`hls error ignored (${ignored})`)
          return
        }

        if (
          data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR &&
          isPermanentManifestStatus(status) &&
          !manifestFailureCounted
        ) {
          manifestFailureCounted = true
          manifestHttpFailuresRef.current += 1
          debugLog(
            `manifest HTTP ${status} on fresh attempt ${manifestHttpFailuresRef.current}`
          )
        }

        const input: PlaybackErrorInput = {
          engine: "hls",
          hlsType: data.type,
          details: data.details,
          httpStatus: status,
          manifestHttpFailureCount:
            data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR
              ? manifestHttpFailuresRef.current
              : undefined,
        }

        lastFailureInput = input

        if (data.fatal) {
          const classification = classifyPlaybackError(input)
          debugLog(
            `hls fatal classified: kind=${classification.kind} reason=${classification.reason}`
          )

          if (classification.kind === "permanent") {
            failNow(input)
            return
          }

          debugLog(`hls fatal temporary: ladder step ${ladderStep}`)
          armLadderStep()
          return
        }

        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
          debugLog(`hls bufferStalledError, ${videoFacts(video)}`)

          // A hint only: sample sooner; the facts decide the spinner.
          sample()
        }
      })
    } else {
      usingHls = false
      usingHlsRef.current = false
      hlsRef.current = null
      unsupportedRef.current = true
      startupErrorReasonRef.current = "unsupportedFormat"
      debugLog("engine: none — stream format unsupported")
    }

    /**
     * First visit: attempt autoplay so clicking a channel plays the stream
     * without an extra tap. Browsers that block play() without a fresh
     * gesture on the video element will reject — in that case we do nothing
     * and the play button stays visible for the user to tap. We only mark
     * the stream as started once play() actually resolves, so the button is
     * never hidden unless playback is genuinely underway.
     */
    if (
      reloadToken === 0 &&
      !hasStartedRef.current &&
      !startingRef.current &&
      !unsupportedRef.current
    ) {
      const video = videoRef.current
      if (video) {
        void video.play().then(() => {
          if (cancelled) return
          hasStartedRef.current = true
          setHasStarted(true)
          setStreamActive(true)
          setIsLoading(true)
        }).catch((err) => {
          if (!isAbortError(err)) {
            debugLog(`autoplay blocked, play button will show: ${String(err)}`)
          }
        })
      }
    }

    // Frame-count fallback for browsers without getVideoPlaybackQuality().
    if (videoFrameCount(video) === null) {
      const callbackVideo = video as FrameCallbackVideo

      if (typeof callbackVideo.requestVideoFrameCallback === "function") {
        const onFrame = () => {
          if (cancelled) return

          rvfcFrameCount += 1
          rvfcHandle = callbackVideo.requestVideoFrameCallback?.(onFrame) ?? null
        }

        rvfcHandle = callbackVideo.requestVideoFrameCallback(onFrame)
      }
    }

    // Dev-only simulation hooks, installed only outside production.
    const simulateVideoFreeze = (durationMs = 12_000) => {
      const duration =
        Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0

      simulatedFrameFreezeUntilRef.current = duration > 0 ? Date.now() + duration : 0
      simulatedFrameCount = null
      debugLog(
        `simulate video freeze for ${duration}ms (0 clears); ${videoFacts(video)}`
      )
      return true
    }

    const simulateFatalNetworkError = (status = 503) => {
      if (!hls) {
        debugLog("simulate fatal network error: no hls.js instance active")
        return false
      }

      const code = Number.isFinite(status) ? status : 503
      const manifest = code >= 400 && code < 500
      const payload = {
        type: Hls.ErrorTypes.NETWORK_ERROR,
        details: manifest
          ? Hls.ErrorDetails.MANIFEST_LOAD_ERROR
          : Hls.ErrorDetails.FRAG_LOAD_ERROR,
        fatal: true,
        error: new Error(`Simulated HTTP ${code}`),
        response: {
          url: src,
          code,
          text: `Simulated HTTP ${code}`,
        },
      } as ErrorData

      debugLog(`simulate fatal network error HTTP ${code} (${payload.details})`)
      hls.emit(Hls.Events.ERROR, Hls.Events.ERROR, payload)
      return true
    }

    if (DEBUG_PLAYBACK) {
      window.__simulateVideoFreeze = simulateVideoFreeze
      window.__simulateFatalNetworkError = simulateFatalNetworkError
    }

    const sampler = setInterval(sample, PLAYER_SAMPLE_INTERVAL_MS)

    return () => {
      cancelled = true
      unsupportedRef.current = false
      hlsRef.current = null

      clearInterval(sampler)
      disarmLadder()
      clearStabilityTimers()

      prebufferRef.current = idlePrebuffer()
      intentionalPauseRef.current = false
      rebufferActive = false
      spinnerOn = false
      frameEpisode = null
      deliberatePauseUntil = 0

      video.removeEventListener("playing", onPlaying)
      video.removeEventListener("waiting", onWaiting)
      video.removeEventListener("canplay", onCanPlay)
      video.removeEventListener("stalled", onStalled)
      video.removeEventListener("pause", onPause)
      video.removeEventListener("ended", onEnded)
      video.removeEventListener("error", onVideoError)
      video.removeEventListener("seeking", onSeeking)
      video.removeEventListener("seeked", onSeeked)
      video.removeEventListener("loadedmetadata", autoPlay)

      window.removeEventListener("online", onOnline)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("pageshow", onPageShow)

      if (nativeResumeListener !== null) {
        video.removeEventListener("loadedmetadata", nativeResumeListener)
        nativeResumeListener = null
      }

      if (rvfcHandle !== null) {
        ;(video as FrameCallbackVideo).cancelVideoFrameCallback?.(rvfcHandle)
        rvfcHandle = null
      }

      if (DEBUG_PLAYBACK) {
        if (window.__simulateVideoFreeze === simulateVideoFreeze) {
          delete window.__simulateVideoFreeze
        }

        if (window.__simulateFatalNetworkError === simulateFatalNetworkError) {
          delete window.__simulateFatalNetworkError
        }
      }

      // destroy() aborts every request hls.js had pending (manifests,
      // playlist, fragments, keys); native playback's pending fetches are
      // cancelled by the load reset.
      hls?.destroy()
      hls = null

      queueMicrotask(() => {
        setIsBuffering(false)
        setPrepare(null)
        setNeedsTapToPlay(false)
      })

      video.pause()
      video.removeAttribute("src")
      video.load()
    }
  }, [
    src,
    reloadToken,
    gesturePlay,
    requestFrameRestart,
    requestSilentReconnect,
  ])

  // Returning to a stream the user had paused before hiding: offer one-tap
  // resume. If playback was running while hidden, the engine effect resumes
  // it automatically instead (and no overlay flashes).
  useEffect(() => {
    let wasPausedWhenHidden = false

    const handleVisibilityChange = () => {
      const video = videoRef.current
      if (!video || !hasStartedRef.current || unsupportedRef.current) return

      if (document.hidden) {
        wasPausedWhenHidden =
          (video.paused || video.ended) && !pausedWhileHiddenRef.current
        return
      }

      if (video.error) return
      if (intentionalPauseRef.current) return
      if (!wasPausedWhenHidden) return

      if (video.paused || video.ended) {
        queueMicrotask(() => setAwaitingResume(true))
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () =>
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      )
  }, [])

  const handleResume = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    setAwaitingResume(false)
    setIsLoading(true)
    setStreamActive(true)
    setError("")

    // Live edges move on while the tab was hidden: restart fetching when a
    // player is behind the stream, and jump when it is far behind.
    try {
      hlsRef.current?.startLoad()
    } catch {
      // startLoad without an active run is a no-op.
    }

    const hls = hlsRef.current
    const target =
      hls?.liveSyncPosition ??
      (video.seekable.length > 0
        ? video.seekable.end(video.seekable.length - 1) -
          PLAYER_LIVE_EDGE_OFFSET_S
        : null)

    if (
      typeof target === "number" &&
      Number.isFinite(target) &&
      target - video.currentTime > PLAYER_LIVE_BEHIND_MAX_S
    ) {
      try {
        video.currentTime = target
      } catch {
        // A failed seek still leaves the normal play resume below.
      }
    }

    gesturePlay()
  }, [gesturePlay])

  const handleRetry = useCallback(() => {
    clearRestartTimer()
    reconnectCountRef.current = 0
    manifestHttpFailuresRef.current = 0
    frameFreezeRunsRef.current = []
    frameFreezeCooldownUntilRef.current = 0
    simulatedFrameFreezeUntilRef.current = 0
    frameRestartRecoveryRef.current = false
    stallTimesRef.current = []
    lastRebufferAtRef.current = 0
    pausedWhileHiddenRef.current = false
    strugglingShownRef.current = false
    tooSlowShownRef.current = false
    dataSaverAppliedRef.current = false
    setBanner(null)
    setIsReconnecting(false)
    setAwaitingResume(false)
    setNeedsTapToPlay(false)

    if (unsupportedRef.current) {
      debugLog(
        `error screen: kind=permanent reason=${startupErrorReasonRef.current} details=retry`
      )
      setIsLoading(false)
      setError(playbackErrorReasonText(startupErrorReasonRef.current))
      return
    }

    hasStartedRef.current = true
    autoplayOnRestartRef.current = true
    setHasStarted(true)
    setStreamActive(true)
    setError("")
    setIsLoading(true)

    // Exactly the silent-reconnect path: a keyed video element plus a
    // brand-new hls.js/engine effect, so repeated presses stay reliable.
    scheduleFullRestart(0)
  }, [clearRestartTimer, scheduleFullRestart])

  const handleQualityChange = useCallback(
    (value: string) => {
      const choice: QualityChoice =
        value === "auto" || value === "saver"
          ? value
          : { height: Number(value) }

      choiceRef.current = choice
      setQualityChoice(choice)
      writeQualityChoice(choice)

      // A capping change can flush the buffer upstream of the playhead:
      // one grace second keeps the spinner honest afterwards.
      actionGraceUntilRef.current = Date.now() + PLAYER_ACTION_GRACE_MS

      // A height the stream does not carry: the preset stays stored and
      // the active level stays automatic.
      applyQualityChoice(choice, hlsRef.current, qualityLevels)
    },
    [qualityLevels]
  )

  /** One-tap "Data saver" from the struggling suggestion. */
  const applyDataSaver = useCallback(() => {
    choiceRef.current = "saver"
    setQualityChoice("saver")
    writeQualityChoice("saver")
    applyQualityChoice("saver", hlsRef.current, qualityLevels)

    actionGraceUntilRef.current = Date.now() + PLAYER_ACTION_GRACE_MS
    dataSaverAppliedRef.current = true

    // Fresh measurement window before the analyzer judges again.
    stallTimesRef.current = []
    queueMicrotask(() => setBanner(null))
  }, [qualityLevels])

  /** One-tap escape hatch from the "connection too slow" banner. */
  const tryAnotherChannel = useCallback(() => {
    queueMicrotask(() => setBanner(null))
    onTryAnotherChannelRef.current?.()
  }, [])

  const qualityValue =
    qualityChoice === "auto"
      ? "auto"
      : qualityChoice === "saver"
        ? "saver"
        : String(qualityChoice.height)

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-2xl border border-border bg-background shadow-lg"
    >
      <div className="relative aspect-video bg-background">
        <video
          key={`player-${reloadToken}`}
          ref={videoRef}
          controls={hasStarted && !error}
          muted
          playsInline
          preload="none"
          className="h-full w-full bg-black object-contain"
          aria-label={`Live stream: ${channelName}`}
        />

        {!hasStarted && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-muted/40 to-background/80">
            <button
              type="button"
              onClick={startPlayback}
              aria-label={`Play ${channelName}`}
              className="group flex h-20 w-20 items-center justify-center rounded-full border border-border/50 bg-red-600 text-white shadow-xl shadow-red-600/20 transition duration-200 hover:scale-110 hover:bg-red-500 focus:ring-4 focus:ring-red-400/50 focus:outline-none sm:h-24 sm:w-24"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="ml-1 h-9 w-9 sm:h-11 sm:w-11"
                aria-hidden="true"
              >
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </button>

            <p className="mt-5 text-sm font-semibold text-foreground">
              Watch {channelName}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Click to start streaming
            </p>
          </div>
        )}

        {prepare && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 px-6">
            <p className="text-sm font-medium text-foreground">
              Preparing stream...
            </p>
            <div className="mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-muted/50 sm:w-64">
              <div
                className="h-full rounded-full bg-red-500 transition-[width] duration-300"
                style={{
                  width: `${Math.round(prepare.progress * 100)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {Math.round(prepare.progress * 100)}% buffered
            </p>

            {prepare.playNow && !isBuffering && (
              <button
                type="button"
                onClick={handlePlayNow}
                className="mt-4 flex min-h-[44px] items-center rounded-xl bg-red-600 px-5 text-sm font-bold text-white transition hover:bg-red-500"
              >
                Play now
              </button>
            )}
          </div>
        )}

        {isBuffering &&
          !isReconnecting &&
          hasStarted &&
          !error &&
          !awaitingResume &&
          !prepare &&
          !needsTapToPlay && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-background/60">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-border/50 border-t-red-500" />
              <p className="mt-4 text-sm text-white">Buffering...</p>
            </div>
          )}

        {hasStarted &&
          !isBuffering &&
          !isPlaying &&
          !isReconnecting &&
          streamActive &&
          !error &&
          !awaitingResume &&
          !prepare &&
          !needsTapToPlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-border/50 border-t-red-500" />
              <p className="mt-4 text-sm text-white">Connecting to stream...</p>
            </div>
          )}

        {isReconnecting && hasStarted && !error && !needsTapToPlay && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/60">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-border/50 border-t-red-500" />
            <p className="mt-4 text-sm text-white">Reconnecting...</p>
          </div>
        )}

        {awaitingResume && hasStarted && !error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/70 p-6 text-center">
            <Play
              className="h-6 w-6 text-muted-foreground"
              aria-hidden="true"
              strokeWidth={2.5}
            />
            <p className="mt-3 text-sm font-medium text-foreground">
              Stream paused
            </p>
            <button
              type="button"
              onClick={handleResume}
              className="mt-3 flex min-h-[44px] items-center rounded-xl bg-red-600 px-5 text-sm font-bold text-white transition hover:bg-red-500"
            >
              Resume
            </button>
          </div>
        )}

        {needsTapToPlay && !error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 p-6 text-center">
            <button
              type="button"
              onClick={handleTapToPlay}
              aria-label={`Play ${channelName}`}
              className="group flex h-20 w-20 items-center justify-center rounded-full border border-border/50 bg-red-600 text-white shadow-xl shadow-red-600/20 transition duration-200 hover:scale-110 hover:bg-red-500 focus:ring-4 focus:ring-red-400/50 focus:outline-none sm:h-24 sm:w-24"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="ml-1 h-9 w-9 sm:h-11 sm:w-11"
                aria-hidden="true"
              >
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </button>

            <p className="mt-5 text-sm font-semibold text-foreground">
              Tap to play
            </p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 p-6 text-center">
            <p className="max-w-md text-sm text-red-300">{error}</p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleRetry}
                className="flex min-h-[44px] items-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                Try Again
              </button>

              {onTryAnotherChannel && (
                <button
                  type="button"
                  onClick={onTryAnotherChannel}
                  className="flex min-h-[44px] items-center rounded-lg bg-muted/50 px-5 text-sm font-semibold text-foreground transition hover:bg-muted/30"
                >
                  Try another channel
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {banner && !error && (
        <div
          role="status"
          className={cn(
            "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t px-4 py-2",
            banner === "struggling"
              ? "border-amber-400/30 bg-amber-400/10"
              : "border-red-500/30 bg-red-500/10"
          )}
        >
          <p
            className={cn(
              "text-xs",
              banner === "struggling" ? "text-amber-200" : "text-red-200"
            )}
          >
            {banner === "struggling"
              ? "Playback is struggling. Switch to lower quality?"
              : "Your connection looks too slow for this channel."}
          </p>

          <div className="ml-auto flex items-center gap-2">
            {banner === "struggling" && (
              <button
                type="button"
                onClick={applyDataSaver}
                className="flex min-h-[32px] items-center rounded-lg bg-amber-500 px-3 text-xs font-bold text-black transition hover:bg-amber-400"
              >
                Data saver
              </button>
            )}

            {banner === "tooSlow" && (
              <button
                type="button"
                onClick={tryAnotherChannel}
                className="flex min-h-[32px] items-center rounded-lg bg-red-600 px-3 text-xs font-bold text-white transition hover:bg-red-500"
              >
                Try another channel
              </button>
            )}

            <button
              type="button"
              onClick={() => setBanner(null)}
              className="flex min-h-[32px] items-center px-2 text-xs text-zinc-400 transition hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 px-4 py-3 border-t border-border/80">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            isPlaying ? "animate-pulse bg-red-500" : "bg-muted-foreground"
          )}
        />
        <span className="truncate text-sm font-medium text-foreground">
          {channelName}
        </span>

        <span className="ml-auto text-xs text-muted-foreground">
          {isPlaying ? "LIVE" : isLoading ? "LOADING" : "READY"}
        </span>

        {qualityLevels.length > 1 && (
          <select
            value={qualityValue}
            onChange={(event) => handleQualityChange(event.target.value)}
            aria-label="Quality"
            className="h-11 w-24 rounded-lg border border-border bg-input px-2 text-xs text-foreground outline-none focus:border-red-500"
          >
            <option value="auto">Auto</option>
            <option value="saver">Data saver</option>
            {qualityLevels.map((level) => (
              <option key={level.index} value={String(level.height)}>
                {level.height}p
              </option>
            ))}
          </select>
        )}

        {canPictureInPicture && (
          <button
            type="button"
            onClick={togglePictureInPicture}
            aria-label="Picture in picture"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
          >
            <PictureInPicture className="h-5 w-5" aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/10 hover:text-white"
        >
          {isFullscreen ? (
            <Minimize className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Maximize className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  )
}
