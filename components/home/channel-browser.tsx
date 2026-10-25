"use client"

import { X } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"
import { ChannelListItem } from "@/components/home/channel-list-item"
import { matchesSearch } from "@/lib/channels"
import type { Channel, ChannelStatus } from "@/lib/types"

const SKELETON_ROW_COUNT = 6

function ChannelRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-[#101014] p-3">
      <span className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-[#1d1d24]" />
      <div className="min-w-0 flex-1 space-y-2">
        <span className="block h-4 w-1/3 rounded bg-[#1d1d24]" />
        <span className="block h-3 w-1/4 rounded bg-[#1d1d24]" />
      </div>
    </div>
  )
}

type ChannelBrowserProps = {
  /** The full playlist, used for empty-playlist detection and match counting. */
  channels: Channel[]
  /** Working channels from the lazy tester, in stable display order. */
  workingChannels: Channel[]
  /** How many list entries may be displayed; grows through loadMore(). */
  visibleCount: number
  /** True when the tester has processed every channel. */
  isDone: boolean
  /** True while the slow background scan of the whole server runs. */
  isScanning: boolean
  /** True after the background scan was boosted to full speed. */
  scanBoosted: boolean
  /** Per-channel status for the list dots. */
  statuses: Record<string, ChannelStatus>
  search: string
  onSearchChange: (value: string) => void
  onLoadMore: () => void
  onBoostScan: () => void
  onRetestAll: () => void
  loading: boolean
  error: string | null
  serverName: string
  selectedChannelId: string | null
  onSelect: (channel: Channel) => void
}

export function ChannelBrowser({
  channels,
  workingChannels,
  visibleCount,
  isDone,
  isScanning,
  scanBoosted,
  statuses,
  search,
  onSearchChange,
  onLoadMore,
  onBoostScan,
  onRetestAll,
  loading,
  error,
  serverName,
  selectedChannelId,
  onSelect,
}: ChannelBrowserProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const lastLoadAtRef = useRef(0)
  const savedScrollRef = useRef(0)
  const prevSearchRef = useRef(search)
  const onLoadMoreRef = useRef(onLoadMore)

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore
  })

  const isSearching = search.trim() !== ""

  const matchedChannels = useMemo(
    () => workingChannels.filter((channel) => matchesSearch(channel, search)),
    [workingChannels, search]
  )

  // Matching channels that have no result yet (never tested or stale).
  const pendingMatchCount = useMemo(() => {
    if (!isSearching) return 0

    let pending = 0

    for (const channel of channels) {
      if (!matchesSearch(channel, search)) continue

      const status = statuses[channel.id]

      if (status === undefined || status === "testing") pending += 1
    }

    return pending
  }, [channels, isSearching, search, statuses])

  const shownCount = Math.min(visibleCount, matchedChannels.length)
  const visibleChannels = useMemo(
    () => matchedChannels.slice(0, shownCount),
    [matchedChannels, shownCount]
  )

  const hasPlaylist = channels.length > 0
  const showList = !loading && !error && hasPlaylist
  const moreToShow = shownCount < matchedChannels.length
  const moreComing = !isDone && showList
  const hasMore = showList && (moreToShow || moreComing)

  // Testing finished without a single working channel: clear dead end.
  const noWorkingChannels =
    showList && isDone && workingChannels.length === 0 && !isSearching

  // Keep the scrolled position across a search round trip even when the
  // browser clamps scrollTop while the list is temporarily empty.
  useEffect(() => {
    const node = scrollRef.current

    if (node) {
      const wasSearching = prevSearchRef.current.trim() !== ""

      if (!wasSearching && isSearching) {
        savedScrollRef.current = node.scrollTop
      } else if (wasSearching && !isSearching) {
        node.scrollTop = savedScrollRef.current
      }
    }

    prevSearchRef.current = search
  }, [search, isSearching])

  // Infinite scroll: the sentinel sits at the end of the list. The observer
  // root is whichever scroll container actually scrolls: the list container
  // itself on desktop (it keeps its own scrolling pane) or the viewport on
  // mobile, where the page scrolls.
  useEffect(() => {
    if (!hasMore) return

    const node = sentinelRef.current
    if (!node) return

    const container = scrollRef.current
    const root =
      container && container.scrollHeight > container.clientHeight + 1
        ? container
        : null

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return

        // Guard against double callbacks before state renders.
        const now = Date.now()
        if (now - lastLoadAtRef.current < 250) return
        lastLoadAtRef.current = now

        onLoadMoreRef.current()
      },
      { root, rootMargin: "400px" }
    )

    observer.observe(node)

    return () => observer.disconnect()
  }, [hasMore, moreToShow, isSearching])

  const findingMoreIndicator = (
    <div
      ref={sentinelRef}
      className="py-3 text-center text-xs text-zinc-500"
      aria-live="polite"
    >
      Finding more channels...
    </div>
  )

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Sports Channels</h2>
        <span className="text-sm text-zinc-500">{matchedChannels.length}</span>
      </div>

      <p className="mb-3 text-xs text-zinc-500">Source: {serverName}</p>

      <div className="relative mb-3 max-lg:sticky max-lg:top-[var(--rb-player-h,0px)] max-lg:z-10 max-lg:bg-[#09090b] max-lg:pb-1">
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search channels..."
          autoComplete="off"
          enterKeyHint="search"
          className="w-full min-h-[44px] rounded-xl border border-white/10 bg-[#15151b] px-4 py-3 pr-12 text-base outline-none placeholder:text-zinc-500 focus:border-red-500"
          aria-label="Search channels"
        />

        {isSearching && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-1 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* The page scrolls on mobile; desktop keeps the list's own pane. */}
      <div
        className="space-y-2 lg:max-h-[650px] lg:overflow-y-auto lg:pr-1"
        ref={scrollRef}
      >
        {loading && (
          <>
            <p className="sr-only" aria-live="polite">
              Loading {serverName} channels...
            </p>

            {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
              <ChannelRowSkeleton key={index} />
            ))}
          </>
        )}

        {!loading && error && (
          <p className="py-8 text-center text-sm text-red-300">{error}</p>
        )}

        {!loading && !error && !hasPlaylist && (
          <p className="py-8 text-center text-sm text-zinc-400">
            No valid channels were found in this playlist.
          </p>
        )}

        {noWorkingChannels && (
          <div className="py-8 text-center">
            <p className="text-sm text-zinc-300">
              No working channels were found.
            </p>
            <p className="mx-auto mt-2 max-w-sm text-xs text-zinc-500">
              Streams can also fail because they block browser access or are
              not available in your region.
            </p>
            <button
              type="button"
              onClick={onRetestAll}
              className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-red-600 px-5 text-xs font-bold text-white transition hover:bg-red-500"
            >
              Retest
            </button>
          </div>
        )}

        {showList && !noWorkingChannels && visibleChannels.map((channel) => (
          <ChannelListItem
            key={channel.id}
            channel={channel}
            status={statuses[channel.id]}
            selected={selectedChannelId === channel.id}
            onSelect={onSelect}
          />
        ))}

        {showList && !noWorkingChannels && isSearching && (
          <>
            {moreToShow && findingMoreIndicator}

            {pendingMatchCount > 0 && (
              <p
                className="py-3 text-center text-xs text-zinc-500"
                aria-live="polite"
              >
                {matchedChannels.length === 0
                  ? `Checking ${pendingMatchCount} matching channels...`
                  : `Checking ${pendingMatchCount} more...`}
              </p>
            )}

            {pendingMatchCount === 0 &&
              matchedChannels.length === 0 && (
                <p className="py-8 text-center text-sm text-zinc-400">
                  No working channel found for “{search.trim()}” on this
                  server. Try the other server.
                </p>
              )}
          </>
        )}

        {showList && !noWorkingChannels && !isSearching && (
          <>
            {hasMore && findingMoreIndicator}

            {isScanning && (
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-3 text-center text-xs text-zinc-500">
                <span aria-live="polite">
                  {workingChannels.length} working channels found · checking
                  more in the background
                </span>

                {!scanBoosted && (
                  <button
                    type="button"
                    onClick={onBoostScan}
                    className="inline-flex min-h-[44px] items-center px-2 underline transition hover:text-zinc-300"
                  >
                    Check all channels now
                  </button>
                )}
              </div>
            )}

            {!isScanning && isDone && (
              <p
                className="py-3 text-center text-xs text-zinc-500"
                aria-live="polite"
              >
                All channels checked · {workingChannels.length} working
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
