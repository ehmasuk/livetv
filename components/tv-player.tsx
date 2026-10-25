"use client"

import Hls from "hls.js"
import { useCallback, useEffect, useRef, useState } from "react"
import { hasNativeHlsSupport, PLAYER_HLS_CONFIG } from "@/lib/hls"
import { cn } from "@/lib/utils"

type TVPlayerProps = {
  src: string
  channelName: string
  /** Called once, when playback actually starts for this channel. */
  onPlaybackWorking?: () => void
  /** Called once on a fatal player error, even before the user presses play. */
  onPlaybackFailed?: () => void
}

const MAX_NETWORK_RECOVERIES = 2
const MAX_MEDIA_RECOVERIES = 2

/**
 * HLS player with a click-to-start overlay.
 *
 * Mount this component with a `key` that changes when `src` changes so all
 * playback state is reset for the new channel.
 */
export function TVPlayer({
  src,
  channelName,
  onPlaybackWorking,
  onPlaybackFailed,
}: TVPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hasStartedRef = useRef(false)
  const startingRef = useRef(false)
  const unsupportedRef = useRef(false)

  const onPlaybackWorkingRef = useRef(onPlaybackWorking)
  const onPlaybackFailedRef = useRef(onPlaybackFailed)

  useEffect(() => {
    onPlaybackWorkingRef.current = onPlaybackWorking
    onPlaybackFailedRef.current = onPlaybackFailed
  })

  const [hasStarted, setHasStarted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [reloadToken, setReloadToken] = useState(0)

  const startPlayback = useCallback(async () => {
    if (startingRef.current) return

    const video = videoRef.current
    if (!video) return

    if (unsupportedRef.current) {
      setHasStarted(true)
      setError("Your browser does not support this stream format.")
      onPlaybackFailedRef.current?.()
      return
    }

    startingRef.current = true
    hasStartedRef.current = true
    setHasStarted(true)
    setError("")
    setIsLoading(true)

    try {
      await video.play()
    } catch {
      setIsLoading(false)
      setIsPlaying(false)
      setError(
        "Unable to start playback. The stream may be unavailable or blocked."
      )
      onPlaybackFailedRef.current?.()
    } finally {
      startingRef.current = false
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    let hls: Hls | null = null
    let cancelled = false
    let networkRecoveries = 0
    let mediaRecoveries = 0
    let workingReported = false
    let failureReported = false

    const reportFailure = () => {
      if (failureReported) return

      // Every fatal failure is escalated, also before play: the dashboard
      // decides whether to advance to the next channel.
      failureReported = true
      onPlaybackFailedRef.current?.()
    }

    const autoPlayOnLoad = reloadToken > 0

    unsupportedRef.current = false

    const fail = (message: string) => {
      if (cancelled) return

      reportFailure()
      setIsLoading(false)
      setIsPlaying(false)
      setError(message)
      video.pause()
      hls?.destroy()
      hls = null
    }

    const onPlaying = () => {
      if (!workingReported) {
        workingReported = true
        onPlaybackWorkingRef.current?.()
      }

      setIsPlaying(true)
      setIsLoading(false)
      setError("")
    }

    const onWaiting = () => {
      if (hasStartedRef.current) {
        setIsLoading(true)
      }
    }

    const onCanPlay = () => {
      setIsLoading(false)
    }

    const onPause = () => {
      setIsPlaying(false)
    }

    const onVideoError = () => {
      if (!cancelled && video.error) {
        fail("This stream could not be played. Please try again.")
      }
    }

    const autoPlay = () => {
      if (!autoPlayOnLoad) return

      void video
        .play()
        .catch(() => fail("Unable to play this stream. Please try again."))
    }

    video.addEventListener("playing", onPlaying)
    video.addEventListener("waiting", onWaiting)
    video.addEventListener("canplay", onCanPlay)
    video.addEventListener("pause", onPause)
    video.addEventListener("error", onVideoError)

    if (hasNativeHlsSupport(video)) {
      if (autoPlayOnLoad) {
        video.addEventListener("loadedmetadata", autoPlay, { once: true })
      }

      video.src = src
      video.load()
    } else if (Hls.isSupported()) {
      hls = new Hls(PLAYER_HLS_CONFIG)

      hls.loadSource(src)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, autoPlay)

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (cancelled || !data.fatal) return

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (networkRecoveries < MAX_NETWORK_RECOVERIES) {
            networkRecoveries += 1
            hls?.startLoad()
            return
          }
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          if (mediaRecoveries < MAX_MEDIA_RECOVERIES) {
            mediaRecoveries += 1
            hls?.recoverMediaError()
            return
          }
        }

        fail("This stream is unavailable or unsupported. Try another channel.")
      })
    } else {
      unsupportedRef.current = true
    }

    return () => {
      cancelled = true
      unsupportedRef.current = false

      video.removeEventListener("playing", onPlaying)
      video.removeEventListener("waiting", onWaiting)
      video.removeEventListener("canplay", onCanPlay)
      video.removeEventListener("pause", onPause)
      video.removeEventListener("error", onVideoError)
      video.removeEventListener("loadedmetadata", autoPlay)

      hls?.destroy()
      hls = null

      video.pause()
      video.removeAttribute("src")
      video.load()
    }
  }, [src, reloadToken])

  const handleRetry = useCallback(() => {
    if (unsupportedRef.current) {
      setIsLoading(false)
      setError("Your browser does not support this stream format.")
      return
    }

    hasStartedRef.current = true
    setHasStarted(true)
    setError("")
    setIsLoading(true)
    setReloadToken((token) => token + 1)
  }, [])

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          controls={hasStarted && !error}
          playsInline
          preload="none"
          className="h-full w-full bg-black object-contain"
          aria-label={`Live stream: ${channelName}`}
        />

        {!hasStarted && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900/50 to-black/80">
            <button
              type="button"
              onClick={() => void startPlayback()}
              aria-label={`Play ${channelName}`}
              className="group flex h-20 w-20 items-center justify-center rounded-full border border-white/30 bg-red-600 text-white shadow-xl shadow-red-600/20 transition duration-200 hover:scale-110 hover:bg-red-500 focus:ring-4 focus:ring-red-400/50 focus:outline-none sm:h-24 sm:w-24"
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

            <p className="mt-5 text-sm font-semibold text-white">
              Watch {channelName}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Click to start streaming
            </p>
          </div>
        )}

        {isLoading && hasStarted && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-red-500" />
            <p className="mt-4 text-sm text-white">Connecting to stream...</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-6 text-center">
            <p className="max-w-md text-sm text-red-300">{error}</p>

            <button
              type="button"
              onClick={handleRetry}
              className="mt-4 rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 py-3">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            isPlaying ? "animate-pulse bg-red-500" : "bg-zinc-500"
          )}
        />
        <span className="truncate text-sm font-medium text-white">
          {channelName}
        </span>

        <span className="ml-auto text-xs text-zinc-400">
          {isPlaying ? "LIVE" : isLoading ? "LOADING" : "READY"}
        </span>
      </div>
    </div>
  )
}
