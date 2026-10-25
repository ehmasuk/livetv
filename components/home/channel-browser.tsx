"use client"

import { ChannelListItem } from "@/components/home/channel-list-item"
import { matchesSearch } from "@/lib/channels"
import type { Channel, ChannelStatus } from "@/lib/types"
import { Search, ServerIcon, X } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"

const SKELETON_ROW_COUNT = 6

function ChannelRowSkeleton() {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card/60 p-2.5">
      <span className="h-8 w-8 shrink-0 animate-pulse rounded-md bg-muted" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <span className="block h-3.5 w-1/3 animate-pulse rounded bg-muted" />
        <span className="block h-2.5 w-1/4 animate-pulse rounded bg-muted" />
      </div>
      <span className="ml-2 h-2 w-2 animate-pulse rounded-full bg-muted" />
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
  onSearchChange?: (value: string) => void
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

  // Infinite scroll: the sentinel sits at the end of the list.
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
      className="flex items-center justify-center gap-1.5 py-2.5 text-center text-xs text-muted-foreground"
      aria-live="polite"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
      Finding more channels...
    </div>
  )

  return (
    <div>
      {/* Mobile-only search, directly above the channel list so it stays close
          to the channels instead of sitting above the player. */}
      {onSearchChange && (
        <div className="relative mb-2 md:hidden">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search channels..."
            autoComplete="off"
            enterKeyHint="search"
            className="w-full pl-9 pr-8 py-2.5 bg-background border border-border focus:border-red-500 rounded-lg text-sm text-foreground placeholder:text-muted-foreground outline-none transition"
            aria-label="Search channels"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Channel Cards List Container */}
      <div
        className="glass-panel max-h-125 min-h-95 space-y-1.5 overflow-y-auto rounded-xl border border-border p-2 lg:max-h-[calc(100vh-230px)]"
        ref={scrollRef}
      >
        {/* Channels Box Header */}
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-foreground uppercase">
            Channels
            <span className="rounded-md bg-green-500/20 px-1.5 py-0.5 text-[10px] font-extrabold text-green-500 dark:text-green-400">
              {matchedChannels.length}
            </span>
          </span>
          <span className="flex max-w-37.5 items-center gap-1 truncate text-[10px] text-muted-foreground">
            <ServerIcon className="size-3" /> {serverName}
          </span>
        </div>

        <hr className="pt-2" />

        {/* Channel Cards List */}
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
          <p className="py-8 text-center text-xs text-red-500 dark:text-red-300">
            {error}
          </p>
        )}

        {!loading && !error && !hasPlaylist && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No valid channels were found in this playlist.
          </p>
        )}

        {noWorkingChannels && (
          <div className="px-3 py-8 text-center">
            <p className="text-xs font-semibold text-foreground">
              No working channels were found.
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[11px] text-muted-foreground">
              Streams may block browser access or may not be available in your
              region.
            </p>
            <button
              type="button"
              onClick={onRetestAll}
              className="mt-3 inline-flex items-center rounded-lg bg-red-600 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-red-500"
            >
              Retest
            </button>
          </div>
        )}

        {showList &&
          !noWorkingChannels &&
          visibleChannels.map((channel) => (
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
                className="flex items-center justify-center gap-1.5 py-2.5 text-center text-xs text-muted-foreground"
                aria-live="polite"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                {matchedChannels.length === 0
                  ? `Checking ${pendingMatchCount} matching channels...`
                  : `Checking ${pendingMatchCount} more...`}
              </p>
            )}

            {pendingMatchCount === 0 && matchedChannels.length === 0 && (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                No working channel found for “{search.trim()}”.
              </div>
            )}
          </>
        )}

        {showList && !noWorkingChannels && !isSearching && (
          <>
            {hasMore && findingMoreIndicator}

            {isScanning && (
              <div className="flex flex-col items-center justify-center gap-1 py-3 text-center text-[11px] text-muted-foreground">
                <span aria-live="polite">
                  {workingChannels.length} working · testing background
                </span>

                {!scanBoosted && (
                  <button
                    type="button"
                    onClick={onBoostScan}
                    className="font-semibold text-red-500 transition hover:underline"
                  >
                    Check all now
                  </button>
                )}
              </div>
            )}

            {!isScanning && isDone && (
              <p
                className="py-3 text-center text-[10px] text-muted-foreground"
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
