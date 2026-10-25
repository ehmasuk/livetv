"use client"

import { useEffect, useMemo, useRef } from "react"
import { ChannelListItem } from "@/components/home/channel-list-item"
import { matchesSearch } from "@/lib/channels"
import type { Channel, ChannelStatus } from "@/lib/types"

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

  // Infinite scroll: the sentinel sits at the end of the list. Reobserve
  // when the sentinel can swap between search and normal mode renders.
  useEffect(() => {
    if (!hasMore) return

    const node = sentinelRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return

        // Guard against double callbacks before state renders.
        const now = Date.now()
        if (now - lastLoadAtRef.current < 250) return
        lastLoadAtRef.current = now

        onLoadMoreRef.current()
      },
      { rootMargin: "400px" }
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

      <input
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search channels..."
        autoComplete="off"
        className="mb-3 w-full rounded-xl border border-white/10 bg-[#15151b] px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-red-500"
        aria-label="Search channels"
      />

      <div
        className="max-h-[650px] space-y-2 overflow-y-auto pr-1"
        ref={scrollRef}
      >
        {loading && (
          <p className="py-8 text-center text-sm text-zinc-400">
            Loading {serverName} channels...
          </p>
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
              className="mt-4 rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white transition hover:bg-red-500"
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
                    className="underline transition hover:text-zinc-300"
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
