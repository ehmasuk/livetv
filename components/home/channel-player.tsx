"use client"

import { Play } from "lucide-react"
import dynamic from "next/dynamic"
import type { Channel } from "@/lib/types"

/**
 * The player (and hls.js with it) is code-split: the list is interactive
 * before the player chunk arrives, and its code is not fetched until a
 * channel is actually selected.
 */
const TVPlayer = dynamic(
  () => import("@/components/tv-player").then((mod) => mod.TVPlayer),
  {
    ssr: false,
    loading: () => (
      <div className="w-full overflow-hidden rounded-2xl border border-border bg-background shadow-lg flex flex-col">
        <div className="relative aspect-video player-grid-bg flex items-center justify-center">
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-border/50 border-t-red-500"
            aria-hidden="true"
          />
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border/80 bg-background/95">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="truncate text-sm font-medium text-muted-foreground">
            Loading player...
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            LOADING
          </span>
        </div>
      </div>
    ),
  }
)

/** One-off player status message; `terminal` variants stay until the user acts. */
export type PlaybackNotice = {
  text: string
  terminal?: boolean
}

type ChannelPlayerProps = {
  channel: Channel | null
  notice?: PlaybackNotice | null
  /** Bumping this remounts the player so "Try again" starts a fresh attempt. */
  attemptToken?: number
  onPlaybackWorking?: () => void
  onPlaybackFailed?: () => void
  /** Reports whether this stream is actively playing (probes pause meanwhile). */
  onPlaybackActiveChange?: (active: boolean) => void
  /** Escape hatch from the player's "connection too slow" banner. */
  onTryAnotherChannel?: () => void
  onRetry?: () => void
}

export function ChannelPlayer({
  channel,
  notice,
  attemptToken = 0,
  onPlaybackWorking,
  onPlaybackFailed,
  onPlaybackActiveChange,
  onTryAnotherChannel,
  onRetry,
}: ChannelPlayerProps) {
  if (!channel) {
    return (
      <div className="w-full overflow-hidden rounded-2xl border border-border bg-background shadow-lg flex flex-col">
        {/* Relative aspect-video screen matching real player */}
        <div className="relative aspect-video player-grid-bg flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-card/90 border border-border/80 text-muted-foreground shadow-lg transition-transform duration-200 hover:scale-105">
            <Play className="h-7 w-7 sm:h-8 sm:w-8 fill-current ml-1" />
          </div>

          <p className="mt-4 text-sm sm:text-base font-semibold text-foreground">
            Select a channel to begin
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose a stream from the live channels library
          </p>
        </div>

        {/* Real-matching bottom control bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border/80 bg-background/95">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
          <span className="truncate text-sm font-medium text-muted-foreground">
            No channel selected
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            READY
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {notice && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2"
        >
          <p className="text-sm text-red-500 dark:text-red-200">{notice.text}</p>

          {notice.terminal && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
            >
              Try again
            </button>
          )}
        </div>
      )}

      <TVPlayer
        key={`${channel.id}:${attemptToken}`}
        src={channel.url}
        channelName={channel.name}
        onPlaybackWorking={onPlaybackWorking}
        onPlaybackFailed={onPlaybackFailed}
        onPlaybackActiveChange={onPlaybackActiveChange}
        onTryAnotherChannel={onTryAnotherChannel}
      />
    </div>
  )
}


