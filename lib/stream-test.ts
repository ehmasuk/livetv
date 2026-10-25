import Hls from "hls.js"
import { STREAM_TEST_TIMEOUT_MS } from "@/lib/constants"
import { hasNativeHlsSupport, PROBE_HLS_CONFIG } from "@/lib/hls"
import type { LoaderStats } from "hls.js"

const PROBE_STYLES = {
  position: "fixed",
  width: "2px",
  height: "2px",
  left: "-10px",
  bottom: "0",
  opacity: "0.01",
  pointerEvents: "none",
} as const

/** Formats a byte count for the dev-only probe log. */
function formatProbeBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

/**
 * Size of a finished download: content length when reported, otherwise the
 * bytes actually received. In-flight requests aborted at teardown are not
 * counted, so totals are a lower bound.
 */
function responseBytes(stats: LoaderStats | undefined): number {
  if (!stats) return 0
  return stats.total > 0 ? stats.total : stats.loaded
}

/**
 * `http://` streams cannot load from an `https://` page (mixed content), so
 * probing them would always fail. Callers use this to mark such channels as
 * unsupported instead of wasting a probe on them.
 */
export function isUnsupportedStreamUrl(url: string): boolean {
  if (typeof window === "undefined" || !window.isSecureContext) return false

  return url.toLowerCase().startsWith("http://")
}

/**
 * Probes a stream in an invisible video element.
 *
 * A probe succeeds as soon as the media emits `loadedmetadata` or hls.js
 * delivers its first fragment, whichever comes first. Playback is *not*
 * required: many working streams refuse to autoplay in background probes.
 *
 * The probe fetches no more than one fragment: the hls.js instance boots on
 * the lowest quality level, and the moment a verdict exists the teardown
 * aborts in-flight requests (`hls.destroy()` cancels the fragment and
 * playlist loaders) and removes the media element.
 *
 * Resolves `false` on fatal loader errors, when the signal aborts, or after
 * the timeout. The caller is responsible for limiting concurrency.
 */
export function testStream(
  url: string,
  signal?: AbortSignal
): Promise<boolean> {
  if (typeof document === "undefined" || isUnsupportedStreamUrl(url)) {
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    const video = document.createElement("video")

    video.muted = true
    video.playsInline = true
    // `metadata` fetches the playlist plus the least data needed for
    // duration/track info; `auto` would keep buffering playable media.
    video.preload = "metadata"
    video.setAttribute("aria-hidden", "true")
    video.tabIndex = -1

    Object.assign(video.style, PROBE_STYLES)
    document.body.appendChild(video)

    let hls: Hls | null = null
    let finished = false
    let probeEngine: "hls.js" | "native" | null = null
    const startedAt = performance.now()
    let probeBytes = 0

    const onAbort = () => finish(false)

    const cleanup = () => {
      clearTimeout(timer)

      signal?.removeEventListener("abort", onAbort)

      video.removeEventListener("playing", onPlaying)
      video.removeEventListener("error", onError)
      video.removeEventListener("loadedmetadata", onMetadata)

      // `destroy()` aborts every in-flight fragment/playlist request and
      // detaches the media element, so nothing keeps downloading.
      hls?.destroy()
      hls = null

      // Resets the element itself; needed for the native-HLS path, where
      // the browser fetches independently of hls.js.
      video.pause()
      video.removeAttribute("src")
      video.load()
      video.remove()
    }

    const finish = (success: boolean) => {
      if (finished) return

      finished = true

      if (process.env.NODE_ENV !== "production") {
        const ms = Math.round(performance.now() - startedAt)
        const size =
          probeEngine === "hls.js"
            ? `~${formatProbeBytes(probeBytes)}`
            : "n/a (browser-managed)"

        console.info(
          `[stream-test] ${size} · ${success ? "ok" : "fail"} · ${ms} ms · ${url}`
        )
      }

      cleanup()
      resolve(success)
    }

    // `playing` still counts, some browsers start playback before metadata
    // settles, but success no longer *requires* it.
    const onPlaying = () => finish(true)
    const onError = () => finish(false)
    const onMetadata = () => finish(true)

    video.addEventListener("playing", onPlaying)
    video.addEventListener("error", onError)
    video.addEventListener("loadedmetadata", onMetadata)

    const timer = setTimeout(() => finish(false), STREAM_TEST_TIMEOUT_MS)

    signal?.addEventListener("abort", onAbort, { once: true })

    if (signal?.aborted) {
      finish(false)
      return
    }

    try {
      if (hasNativeHlsSupport(video)) {
        probeEngine = "native"
        video.src = url
        video.load()
      } else if (Hls.isSupported()) {
        probeEngine = "hls.js"
        const instance = new Hls(PROBE_HLS_CONFIG)
        hls = instance

        // Quality never upgrades mid-probe: cap the ABR to the lowest level
        // from manifest parse on. (The teardown below means a second, larger
        // fragment never loads anyway.)
        instance.on(Hls.Events.MANIFEST_PARSED, () => {
          instance.autoLevelCapping = 0
        })

        // First successfully downloaded fragment: the stream is alive and
        // reachable from this browser, even if metadata has not parsed yet.
        instance.on(Hls.Events.FRAG_LOADED, () => finish(true))

        instance.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) finish(false)
        })

        if (process.env.NODE_ENV !== "production") {
          instance.on(Hls.Events.MANIFEST_LOADED, (_event, data) => {
            probeBytes += responseBytes(data.stats)
          })

          instance.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
            probeBytes += responseBytes(data.stats)
          })

          instance.on(Hls.Events.AUDIO_TRACK_LOADED, (_event, data) => {
            probeBytes += responseBytes(data.stats)
          })

          instance.on(Hls.Events.FRAG_LOADED, (_event, data) => {
            probeBytes += responseBytes((data.part ?? data.frag).stats)
          })
        }

        instance.loadSource(url)
        instance.attachMedia(video)
      } else {
        finish(false)
      }
    } catch {
      finish(false)
    }
  })
}
