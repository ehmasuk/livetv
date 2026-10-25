"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  SEARCH_DEBOUNCE_MS,
  STREAM_HEALTH_BUFFER_PAGES,
  STREAM_HEALTH_CACHE_PREFIX,
  STREAM_HEALTH_FLUSH_INTERVAL_MS,
  STREAM_HEALTH_SCAN_CONCURRENCY,
  STREAM_HEALTH_FAIL_TTL_MS,
  STREAM_HEALTH_FIRST_FAIL_TTL_MS,
  STREAM_HEALTH_OK_TTL_MS,
  STREAM_PAGE_SIZE,
  STREAM_TEST_BATCH_SIZE,
} from "@/lib/constants"
import { matchesSearch } from "@/lib/channels"
import { isUnsupportedStreamUrl, testStream } from "@/lib/stream-test"
import type { Channel, ChannelStatus } from "@/lib/types"

export type StreamHealthEntry = {
  /** Whether the probe succeeded. */
  ok: boolean
  /** When the probe finished (Date.now() at the time). */
  at: number
  /** Consecutive failure counter; reset by every success. */
  fails: number
}

export type StreamHealthCounts = {
  total: number
  working: number
  failed: number
  /** Channels that are untested or currently being tested. */
  pending: number
}

export type LazyStreamTester = {
  /** Working channels in stable display order (cached entries first, then discovery order). */
  workingChannels: Channel[]
  /** Number of working channels the list may currently show. */
  visibleCount: number
  /** True while more working channels exist to paginate or may still be found. */
  hasMore: boolean
  /** True while any foreground probe is actually running. */
  isTesting: boolean
  /** True when every testable channel has a fresh verdict. */
  isDone: boolean
  /** True while the low-priority background scan of the whole server runs. */
  isScanning: boolean
  /** True after the user boosted the background scan to full speed. */
  scanBoosted: boolean
  /** Per-channel status for dots and filters. */
  statuses: Readonly<Record<string, ChannelStatus>>
  counts: StreamHealthCounts
  /** Shows roughly one more page of working channels. */
  loadMore: () => void
  /** Raises the background scan lane to full pool size until the scan completes. */
  boostScan: () => void
  /** Reports real playback results for a channel (used by the player). */
  reportPlayback: (id: string, ok: boolean) => void
  /** Clears this server's saved results and tests everything again. */
  retestAll: () => void
}

type RunState = {
  id: number
  controller: AbortController
  queue: string[]
  queueIndex: number
  /** All probes in flight (foreground lanes plus the background scan lane). */
  activeCount: number
  /** Channel ids of probes that started on the background scan lane. */
  scanIds: Set<string>
  finished: boolean
  paused: boolean
  inFlight: Set<string>
}

type SearchPredicate = (channel: Channel) => boolean

function storageKey(serverId: string) {
  return `${STREAM_HEALTH_CACHE_PREFIX}:${serverId}`
}

function isPageHidden() {
  return typeof document !== "undefined" && document.hidden
}

function parseEntry(value: unknown): StreamHealthEntry | null {
  if (typeof value !== "object" || value === null) return null

  const entry = value as Partial<StreamHealthEntry>

  if (
    typeof entry.ok !== "boolean" ||
    typeof entry.at !== "number" ||
    typeof entry.fails !== "number" ||
    !Number.isFinite(entry.at) ||
    !Number.isFinite(entry.fails) ||
    entry.at <= 0 ||
    entry.fails < 0
  ) {
    return null
  }

  return { ok: entry.ok, at: entry.at, fails: Math.floor(entry.fails) }
}

/** Reads one server's cached results. Storage failures are silently ignored. */
function readHealthCache(
  serverId: string
): Map<string, StreamHealthEntry> {
  const cache = new Map<string, StreamHealthEntry>()

  if (typeof window === "undefined") return cache

  try {
    const raw = window.localStorage.getItem(storageKey(serverId))
    if (!raw) return cache

    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return cache

    for (const [id, value] of Object.entries(parsed)) {
      const entry = parseEntry(value)

      if (entry && id) cache.set(id, entry)
    }
  } catch {
    // Unreadable storage behaves like an empty cache.
  }

  return cache
}

/** Writes one server's cached results. Returns false when storage refuses. */
function writeHealthCache(
  serverId: string,
  cache: Map<string, StreamHealthEntry>
): boolean {
  if (typeof window === "undefined") return false

  try {
    const payload: Record<string, StreamHealthEntry> = {}

    for (const [id, entry] of cache) {
      payload[id] = entry
    }

    window.localStorage.setItem(storageKey(serverId), JSON.stringify(payload))
    return true
  } catch {
    // Storage can be disabled or full; results stay in memory only.
    return false
  }
}

function entryTtlMs(entry: StreamHealthEntry) {
  if (entry.ok) return STREAM_HEALTH_OK_TTL_MS

  return entry.fails >= 2
    ? STREAM_HEALTH_FAIL_TTL_MS
    : STREAM_HEALTH_FIRST_FAIL_TTL_MS
}

function isEntryFresh(entry: StreamHealthEntry | undefined): boolean {
  if (!entry) return false

  return Date.now() - entry.at < entryTtlMs(entry)
}

const BUFFER_PAUSE_COUNT = STREAM_PAGE_SIZE * STREAM_HEALTH_BUFFER_PAGES

/**
 * Lazily tests one server's channels with a continuously-running worker pool.
 *
 * Results are cached in `localStorage` per server, tests run only until the
 * list is buffered a couple of pages beyond what the user can see, and the
 * list itself never reorders: cached working channels appear first in
 * playlist order, then newly found ones in discovery order.
 */
export function useLazyStreamTester(
  serverId: string,
  channels: readonly Channel[],
  search = ""
): LazyStreamTester {
  const [workingIds, setWorkingIds] = useState<string[]>([])
  const [visibleCount, setVisibleCount] = useState(STREAM_PAGE_SIZE)
  const [statuses, setStatuses] = useState<Record<string, ChannelStatus>>({})
  const [isTesting, setIsTesting] = useState(false)
  const [isDone, setIsDone] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const [scanBoosted, setScanBoosted] = useState(false)

  const aliveRef = useRef(true)
  const runRef = useRef<RunState | null>(null)
  const runCountRef = useRef(0)
  const serverIdRef = useRef(serverId)
  const cacheRef = useRef(new Map<string, StreamHealthEntry>())
  const resetAtRef = useRef(0)
  const writeBlockedRef = useRef(false)
  const dirtyRef = useRef(false)
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const workingIdsRef = useRef<string[]>([])
  const visibleCountRef = useRef(STREAM_PAGE_SIZE)
  const channelsRef = useRef<readonly Channel[]>(channels)
  const byId = useMemo(() => {
    const map = new Map<string, Channel>()
    for (const channel of channels) map.set(channel.id, channel)
    return map
  }, [channels])

  /** The pool logic reads the same map through a ref set inside the main effect. */
  const byIdRef = useRef(byId)
  const predicateRef = useRef<SearchPredicate | null>(null)
  const pumpRef = useRef<() => void>(() => {})
  const scanBoostRef = useRef(false)
  const saveDataRef = useRef(false)

  const appendWorkingId = useCallback((id: string) => {
    if (workingIdsRef.current.includes(id)) return

    workingIdsRef.current = [...workingIdsRef.current, id]
    setWorkingIds(workingIdsRef.current)
  }, [])

  /** Rebuilds the status map from cache entries and probes in flight. */
  const emitStatuses = useCallback(() => {
    const byId = byIdRef.current
    if (byId.size === 0) {
      setStatuses({})
      return
    }

    const cache = cacheRef.current
    const inFlight = runRef.current?.inFlight
    const next: Record<string, ChannelStatus> = {}

    for (const [id, channel] of byId) {
      // http:// streams cannot be probed from an https:// page; a retry can
      // never change that, so report it outright.
      if (isUnsupportedStreamUrl(channel.url)) {
        next[id] = "unsupported"
        continue
      }

      if (inFlight?.has(id)) {
        next[id] = "testing"
        continue
      }

      const entry = cache.get(id)

      if (entry && isEntryFresh(entry)) {
        next[id] = entry.ok ? "working" : "failed"
      }
    }

    setStatuses(next)
  }, [])

  /** Marks running/finished/scanning state for the panel, status line and indicator. */
  const updateRunState = useCallback((run: RunState) => {
    const foregroundInFlight = run.activeCount - run.scanIds.size

    setIsTesting(!run.finished && foregroundInFlight > 0)
    setIsDone(run.finished)
    setIsScanning(
      !run.finished &&
        run.paused &&
        run.queueIndex < run.queue.length &&
        !saveDataRef.current
    )
  }, [])

  const flush = useCallback(() => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }

    if (
      !dirtyRef.current ||
      writeBlockedRef.current ||
      serverIdRef.current === ""
    ) {
      return
    }

    dirtyRef.current = false
    const cache = cacheRef.current

    try {
      // Keep the newest verdict per channel. Other tabs may have written
      // results since this tab last flushed; entries written after this
      // tab's most recent retestAll are dropped.
      const stored = readHealthCache(serverIdRef.current)
      const cutoff = resetAtRef.current

      for (const [id, entry] of stored) {
        if (cutoff > 0 && entry.at < cutoff) continue

        const mine = cache.get(id)

        if (!mine || entry.at > mine.at) cache.set(id, entry)
      }

      if (!writeHealthCache(serverIdRef.current, cache)) {
        writeBlockedRef.current = true
      }
    } catch {
      writeBlockedRef.current = true
    }
  }, [])

  const scheduleFlush = useCallback(() => {
    if (writeBlockedRef.current || flushTimerRef.current !== null) return

    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null
      flush()
    }, STREAM_HEALTH_FLUSH_INTERVAL_MS)
  }, [flush])

  const applyResult = useCallback(
    (channel: Channel, ok: boolean) => {
      const previous = cacheRef.current.get(channel.id)
      const fails = ok
        ? 0
        : previous && !previous.ok
          ? Math.min(previous.fails + 1, 99)
          : 1

      cacheRef.current.set(channel.id, { ok, at: Date.now(), fails })
      dirtyRef.current = true
      scheduleFlush()

      if (ok) appendWorkingId(channel.id)
    },
    [appendWorkingId, scheduleFlush]
  )

  /** Reorders the remaining candidates. Never retests a channel with a fresh cache verdict. */
  const rebuildQueue = useCallback(() => {
    const run = runRef.current
    if (!run) return

    const predicate = predicateRef.current
    const cache = cacheRef.current
    const candidates: { id: string; score: number }[] = []

    for (const channel of channelsRef.current) {
      if (isUnsupportedStreamUrl(channel.url)) continue
      if (run.inFlight.has(channel.id)) continue

      const entry = cache.get(channel.id)
      if (entry && isEntryFresh(entry)) continue

      // Never-tested channels are tested before entries whose cache expired.
      // With an active search, matching channels are always tested first.
      const score = (predicate && !predicate(channel) ? 1 : 0) * 2 + (entry ? 1 : 0)

      candidates.push({ id: channel.id, score })
    }

    // Array#sort is stable, so ties keep playlist order.
    candidates.sort((a, b) => a.score - b.score)

    run.queue = candidates.map((candidate) => candidate.id)
    run.queueIndex = 0
  }, [])

  const reloadQueueAndProbe = useCallback(() => {
    rebuildQueue()
    pumpRef.current()
  }, [rebuildQueue])

  const beginRun = useCallback(() => {
    runCountRef.current += 1
    const run: RunState = {
      id: runCountRef.current,
      controller: new AbortController(),
      queue: [],
      queueIndex: 0,
      activeCount: 0,
      scanIds: new Set(),
      finished: false,
      paused: false,
      inFlight: new Set(),
    }
    runRef.current = run

    // Each run starts with the scan lane at its normal (slow) setting.
    scanBoostRef.current = false
    setScanBoosted(false)

    rebuildQueue()

    if (run.queue.length === 0) run.finished = true

    emitStatuses()
    updateRunState(run)
    pumpRef.current()
  }, [emitStatuses, rebuildQueue, updateRunState])

  const probeFinished = useCallback(
    (runId: number, channel: Channel, wasScan: boolean, ok: boolean) => {
      const run = runRef.current

      // An aborted or replaced probe never completed, so its outcome is
      // unknown, not failed. Dropping it keeps aborted probes from marking
      // channels as failed and from writing into the next run's cache.
      if (!run || run.id !== runId) return

      applyResult(channel, ok)
      run.inFlight.delete(channel.id)
      if (wasScan) run.scanIds.delete(channel.id)
      run.activeCount -= 1

      if (!aliveRef.current) {
        flush()
        return
      }

      emitStatuses()
      updateRunState(run)
      pumpRef.current()
    },
    [applyResult, emitStatuses, flush, updateRunState]
  )

  /**
   * Fills the foreground pool (`STREAM_TEST_BATCH_SIZE` probes) and the
   * background scan lane (`STREAM_HEALTH_SCAN_CONCURRENCY`). Foreground
   * lanes: filling the visible list and, at highest priority, search
   * matches. Search matches start even while the list is buffered beyond
   * the visible pages. One settled probe immediately frees its slot.
   */
  const pump = useCallback(() => {
    const run = runRef.current
    if (!run || run.finished || !aliveRef.current) return

    if (isPageHidden()) return

    // Lazy testing: once the list is buffered beyond what is visible, the
    // remaining backlog moves to the low-speed background scan lane.
    const buffered = workingIdsRef.current.length - visibleCountRef.current
    run.paused = buffered >= BUFFER_PAUSE_COUNT

    const scanLaneCap = scanBoostRef.current
      ? STREAM_TEST_BATCH_SIZE
      : STREAM_HEALTH_SCAN_CONCURRENCY
    const scanLaneAllowed = !saveDataRef.current

    while (run.queueIndex < run.queue.length) {
      const foregroundCount = run.activeCount - run.scanIds.size
      const id = run.queue[run.queueIndex]
      run.queueIndex += 1

      const channel = byIdRef.current.get(id)
      if (!channel) continue
      if (run.inFlight.has(id)) continue
      if (isUnsupportedStreamUrl(channel.url)) continue
      if (isEntryFresh(cacheRef.current.get(id))) continue

      const isMatch = predicateRef.current?.(channel) === true

      // No slot available for the class this candidate belongs to: put it
      // back and wait for the next event. Queue order means matches sit in
      // front, so a blocked scan head never starves pending matches.
      const blocked =
        isMatch || !run.paused
          ? foregroundCount >= STREAM_TEST_BATCH_SIZE
          : !scanLaneAllowed || run.scanIds.size >= scanLaneCap

      if (blocked) {
        run.queueIndex -= 1
        break
      }

      const wasScan = !isMatch && run.paused

      run.activeCount += 1
      run.inFlight.add(id)
      if (wasScan) run.scanIds.add(id)

      const runId = run.id

      void testStream(channel.url, run.controller.signal).then(
        (ok) => probeFinished(runId, channel, wasScan, ok),
        () => probeFinished(runId, channel, wasScan, false)
      )
    }

    if (run.queueIndex >= run.queue.length && run.activeCount === 0) {
      run.finished = true

      // The scan finished; the next run starts slow again.
      scanBoostRef.current = false
      setScanBoosted(false)
    }

    emitStatuses()
    updateRunState(run)
  }, [emitStatuses, probeFinished, updateRunState])

  // Assign pump through an effect so settles can start the next probe
  // without a dependency cycle between callbacks.
  useEffect(() => {
    pumpRef.current = pump
  }, [pump])

  useEffect(() => {
    aliveRef.current = true
    serverIdRef.current = serverId
    channelsRef.current = channels
    byIdRef.current = byId

    // Data-saver users opt out of the background scan entirely; the existing
    // lazy behavior and search tests stay active.
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection
    saveDataRef.current = connection?.saveData === true

    // Cached results serve the selected server immediately; entries for
    // channels that no longer exist in the playlist are ignored.
    const cache = readHealthCache(serverId)
    const pruned = new Map<string, StreamHealthEntry>()

    for (const [id, entry] of cache) {
      if (!byId.has(id)) {
        dirtyRef.current = true
        continue
      }

      pruned.set(id, entry)
    }

    cacheRef.current = pruned
    resetAtRef.current = 0

    const workingSeed: string[] = []

    for (const channel of channels) {
      const entry = pruned.get(channel.id)

      if (entry?.ok && isEntryFresh(entry)) workingSeed.push(channel.id)
    }

    workingIdsRef.current = workingSeed

    // State reset is queued so the effect body itself does not call setState
    // synchronously (allowed pattern: external storage is the source here).
    queueMicrotask(() => {
      if (aliveRef.current) setWorkingIds(workingSeed)
      if (aliveRef.current) setVisibleCount(STREAM_PAGE_SIZE)
    })

    visibleCountRef.current = STREAM_PAGE_SIZE

    // beginRun resets run state (including the scan boost); queued so the
    // effect body itself does not call setState synchronously.
    queueMicrotask(() => {
      if (aliveRef.current) beginRun()
    })

    const onVisibilityChange = () => {
      if (!isPageHidden()) pumpRef.current()
    }

    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      aliveRef.current = false
      document.removeEventListener("visibilitychange", onVisibilityChange)

      const run = runRef.current

      runRef.current = null
      if (run) {
        run.finished = true
        run.controller.abort()
      }

      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }

      // Persist whatever results were collected for this server.
      flush()
    }
  }, [serverId, channels, byId, beginRun, flush])

  // A changed search term reprioritizes the queue after a short debounce; it
  // never aborts in-flight tests and never restarts the run.
  useEffect(() => {
    const timer = setTimeout(() => {
      const query = search.trim().toLowerCase()

      predicateRef.current = query
        ? (channel: Channel) => matchesSearch(channel, query)
        : null

      reloadQueueAndProbe()
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [search, reloadQueueAndProbe])

  // Growing what is visible can resume a paused run.
  useEffect(() => {
    visibleCountRef.current = visibleCount
    pumpRef.current()
  }, [visibleCount])

  const loadMore = useCallback(() => {
    setVisibleCount((current) => current + STREAM_PAGE_SIZE)
  }, [])

  const boostScan = useCallback(() => {
    if (scanBoostRef.current) return

    scanBoostRef.current = true
    setScanBoosted(true)
    pumpRef.current()
  }, [])

  const reportPlayback = useCallback(
    (id: string, ok: boolean) => {
      const channel = byIdRef.current.get(id)
      if (!channel) return

      if (ok) {
        cacheRef.current.set(id, { ok: true, at: Date.now(), fails: 0 })
        appendWorkingId(id)
      } else {
        // Only the cache is updated; the channel stays in the visible list.
        const previous = cacheRef.current.get(id)
        const fails =
          previous && !previous.ok ? Math.min(previous.fails + 1, 99) : 1

        cacheRef.current.set(id, { ok: false, at: Date.now(), fails })
      }

      dirtyRef.current = true
      scheduleFlush()
      emitStatuses()
    },
    [appendWorkingId, emitStatuses, scheduleFlush]
  )

  const retestAll = useCallback(() => {
    const previous = runRef.current

    if (previous) {
      previous.controller.abort()
      previous.finished = true
    }

    cacheRef.current = new Map()
    resetAtRef.current = Date.now()
    dirtyRef.current = true

    workingIdsRef.current = []
    setWorkingIds([])

    flush()

    beginRun()
  }, [beginRun, flush])

  const workingChannels = useMemo(
    () =>
      workingIds
        .map((id) => byId.get(id))
        .filter((channel): channel is Channel => Boolean(channel)),
    [byId, workingIds]
  )

  const counts = useMemo(() => {
    let working = 0
    let failed = 0
    let pending = 0

    for (const channel of channels) {
      switch (statuses[channel.id]) {
        case "working":
          working += 1
          break
        // Channels that cannot run in this browser (http:// on an https://
        // page) count as failed in the totals: they need no retry to know
        // they will not work.
        case "failed":
        case "unsupported":
          failed += 1
          break
        case "testing":
          pending += 1
          break
        default:
          pending += 1
          break
      }
    }

    return { total: channels.length, working, failed, pending }
  }, [channels, statuses])

  const hasMore = !isDone || visibleCount < workingIds.length

  return {
    workingChannels,
    visibleCount,
    hasMore,
    isTesting,
    isDone,
    isScanning,
    scanBoosted,
    statuses,
    counts,
    loadMore,
    boostScan,
    reportPlayback,
    retestAll,
  }
}
