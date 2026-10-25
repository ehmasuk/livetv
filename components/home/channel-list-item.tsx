"use client"

import { memo, useState } from "react"
import { cn } from "@/lib/utils"
import type { Channel, ChannelStatus } from "@/lib/types"

type ChannelListItemProps = {
  channel: Channel
  status: ChannelStatus | undefined
  selected: boolean
  onSelect: (channel: Channel) => void
}

const STATUS_LABELS: Record<ChannelStatus | "untested", string> = {
  working: "Working",
  failed: "Failed",
  testing: "Testing",
  untested: "Untested",
}

const STATUS_DOT_CLASSES: Record<ChannelStatus | "untested", string> = {
  working: "bg-emerald-500",
  failed: "bg-rose-500",
  testing: "animate-pulse bg-amber-400",
  untested: "bg-muted-foreground/30",
}

function getChannelMonogram(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2 && parts[0][0] && parts[1][0]) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export const ChannelListItem = memo(function ChannelListItem({
  channel,
  status,
  selected,
  onSelect,
}: ChannelListItemProps) {
  const [logoFailed, setLogoFailed] = useState(false)
  const statusLabel = STATUS_LABELS[status ?? "untested"]
  const showLogo = Boolean(channel.logo) && !logoFailed

  return (
    <button
      type="button"
      onClick={() => onSelect(channel)}
      aria-pressed={selected}
      aria-label={`${channel.name}, ${channel.group}, ${statusLabel}`}
      className={cn(
        "cv-row p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between group w-full text-left",
        selected
          ? "bg-red-500/10 border-red-500 shadow-md shadow-red-500/10"
          : "bg-card/80 border-border hover:bg-card hover:border-slate-400 dark:hover:border-slate-700"
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={cn(
            "w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 overflow-hidden",
            selected
              ? "bg-red-500 text-white"
              : "bg-muted text-muted-foreground"
          )}
        >
          {showLogo ? (
            // Channel logos come from arbitrary playlist hosts, so the Next.js
            // image optimizer cannot be used without proxying every host.
            // Logos load only near the viewport anyway; while the player
            // boots the ones that do load must never compete for bandwidth.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={channel.logo}
              alt=""
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              referrerPolicy="no-referrer"
              width={32}
              height={32}
              className="h-full w-full object-contain p-0.5"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <span>{getChannelMonogram(channel.name)}</span>
          )}
        </div>

        <div className="min-w-0">
          <div className="text-xs font-bold text-foreground group-hover:text-red-500 dark:group-hover:text-white transition-colors truncate">
            {channel.name}
          </div>
          <div className="text-[9px] text-muted-foreground truncate mt-0.5">
            {channel.group || "Sports"}
          </div>
        </div>
      </div>

      {/* Status indicator dot */}
      <span
        title={statusLabel}
        className={cn(
          "w-2 h-2 rounded-full shrink-0 ml-2",
          STATUS_DOT_CLASSES[status ?? "untested"]
        )}
      />
    </button>
  )
})

