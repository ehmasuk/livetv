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
      <div className="flex aspect-video items-center justify-center rounded-2xl border border-white/10 bg-[#15151b] p-6 text-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-red-500"
          aria-hidden="true"
        />
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
      <div className="flex aspect-video items-center justify-center rounded-2xl border border-white/10 bg-[#15151b] p-6 text-center">
        <div>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
            <Play className="h-6 w-6 text-zinc-400" aria-hidden="true" />
          </div>
          <p className="font-semibold">Choose a channel</p>
          <p className="mt-2 text-sm text-zinc-500">
            Select a channel to open its player.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {notice && (
        <div
          role="status"
          className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2"
        >
          <p className="text-sm text-red-200">{notice.text}</p>

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
