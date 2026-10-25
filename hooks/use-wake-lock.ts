"use client"

import { useEffect } from "react"

type WakeLockSentinelLike = {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: "release", listener: () => void) => void
  removeEventListener: (type: "release", listener: () => void) => void
}

type WakeLockApi = {
  request: (type: "screen") => Promise<WakeLockSentinelLike>
}

type WakeLockNavigator = Navigator & {
  wakeLock?: WakeLockApi
}

/**
 * Keeps the screen awake while a stream plays.
 *
 * The lock is requested when `enabled` turns true and released on pause,
 * end, unmount and tab hide; returning to a visible tab re-requests it.
 * Everything is guarded and silent: browsers without the API (Firefox,
 * older iOS) simply do nothing.
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    const wakeLock = (navigator as WakeLockNavigator).wakeLock

    if (!enabled || !wakeLock) return

    let cancelled = false
    let sentinel: WakeLockSentinelLike | null = null

    const release = () => {
      const current = sentinel
      sentinel = null

      if (current && !current.released) {
        current.release().catch(() => {})
      }
    }

    const acquire = () => {
      if (cancelled || sentinel || document.hidden) return

      wakeLock
        .request("screen")
        .then((result) => {
          if (cancelled || document.hidden) {
            result.release().catch(() => {})
            return
          }

          sentinel = result
          result.addEventListener("release", () => {
            sentinel = null
          })
        })
        .catch(() => {})
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        release()
      } else {
        acquire()
      }
    }

    acquire()
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      release()
    }
  }, [enabled])
}
