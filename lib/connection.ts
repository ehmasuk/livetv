import {
  STREAM_HEALTH_SCAN_CONCURRENCY,
  STREAM_HEALTH_SCAN_CONCURRENCY_LOW_POWER,
  STREAM_TEST_BATCH_SIZE,
  STREAM_TEST_BATCH_SIZE_LOW_POWER,
} from "@/lib/constants"

/**
 * Safely reads connection/device signals used to size the test pool.
 *
 * Every API here is missing in some browsers (`navigator.connection`,
 * `navigator.getBattery`, matchMedia on odd runtimes), so each read is
 * defensive and failure falls back to full-capacity probing.
 */
export type ProbeLimits = {
  /** Foreground probes while no channel is playing. */
  foreground: number
  /** Background scan probes while no channel is playing. */
  scan: number
  /** `navigator.connection.saveData` — skips the background scan entirely. */
  saveData: boolean
}

export function isLowPowerDevice(): boolean {
  if (typeof navigator === "undefined") return false

  const connection = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean }
    }
  ).connection

  if (connection?.saveData === true) return true

  if (["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? "")) {
    return true
  }

  // Phones and small foldables: a touch screen on a small viewport.
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    try {
      if (window.matchMedia("(pointer: coarse) and (max-width: 767px)").matches) {
        return true
      }
    } catch {
      // matchMedia can throw on odd runtimes; treat as unknown.
    }
  }

  return false
}

/** Reads the probe pool sizes for this device once per tester mount. */
export function getProbeLimits(): ProbeLimits {
  const lowPower = isLowPowerDevice()
  const connection = (
    typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator & {
          connection?: { saveData?: boolean }
        }).connection
  )

  return {
    foreground: lowPower
      ? STREAM_TEST_BATCH_SIZE_LOW_POWER
      : STREAM_TEST_BATCH_SIZE,
    scan: lowPower
      ? STREAM_HEALTH_SCAN_CONCURRENCY_LOW_POWER
      : STREAM_HEALTH_SCAN_CONCURRENCY,
    saveData: connection?.saveData === true,
  }
}
