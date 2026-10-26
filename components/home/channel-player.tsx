"use client"

import { Play } from "lucide-react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
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
      <div className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm flex flex-col">
        <div className="relative aspect-video player-grid-bg flex items-center justify-center">
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-border/50 border-t-red-500"
            aria-hidden="true"
          />
        </div>
        <div className="flex items-center gap-3 px-6 py-4 border-t border-border/80 bg-card/80">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="truncate text-sm font-medium text-muted-foreground">
            Loading player…
          </span>
          <span className="ml-auto text-xs font-medium text-muted-foreground uppercase tracking-wider">
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
  /** Stops playback and returns to the empty "select a channel" state. */
  onStop?: () => void
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
  onStop,
}: ChannelPlayerProps) {
  if (!channel) {
    return (
      <div className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm flex flex-col">
        {/* Relative aspect-video screen matching real player */}
        <div className="relative aspect-video dark:bg-slate-950 bg-black flex flex-col items-center justify-center p-8 text-center select-none">
          <div className="flex size-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-white/10 border border-white/20 dark:text-muted-foreground shadow transition-transform duration-300 hover:scale-105">
            <Play className="size-7 sm:size-8 fill-current ml-0.5 text-white/80" />
          </div>

          <p className="mt-6 text-sm sm:text-base font-semibold text-white/90 dark:text-foreground">
            Select a channel to begin
          </p>
          <p className="mt-2 text-xs text-white/70 dark:text-muted-foreground">
            Choose a stream from the live channels library
          </p>
          <p className="mt-4 text-[10px] text-muted-foreground/60 max-w-xs mx-auto">
            Streams are tested in your browser before you play — green means
            it&apos;s working.
          </p>
        </div>

        {/* Real-matching bottom control bar */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-border/80 bg-card/80">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          <span className="truncate text-sm font-medium text-muted-foreground">
            No channel selected
          </span>
          <span className="ml-auto text-xs font-medium text-muted-foreground uppercase tracking-wider">
            READY
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {notice && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 shadow-sm"
        >
          <p className="text-sm text-red-500 dark:text-red-200 font-medium">
            {notice.text}
          </p>

          {notice.terminal && (
            <Button
              type="button"
              onClick={onRetry}
              variant="destructive"
              size="sm"
              className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500 hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.4)]"
            >
              Try again
            </Button>
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
        onStop={onStop}
      />
    </div>
  )
}
