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
  if (parts.length >= 2 && parts[0][0] && parts[parts.length - 1][0]) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
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
    <div
      onClick={() => onSelect(channel)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect(channel)
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${channel.name}, ${channel.group}, ${statusLabel}`}
      className={cn(
        "cv-row p-3 rounded-xl border transition-all duration-200 cursor-pointer flex items-center justify-between group w-full text-left outline-none",
        selected
          ? "bg-red-500/10 border-red-500/50 shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]"
          : "bg-card border-border hover:bg-muted/40 hover:border-slate-300 dark:hover:border-slate-700 dark:hover:bg-muted/20",
        "focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-1 focus-visible:border-red-500/60"
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            "w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-caption font-bold overflow-hidden",
            selected
              ? "bg-red-500 text-white"
              : "bg-muted/50 text-muted-foreground"
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
              width={36}
              height={36}
              className="h-full w-full object-contain p-0.5"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <span>{getChannelMonogram(channel.name)}</span>
          )}
        </div>

        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground group-hover:text-red-500 dark:group-hover:text-red-400 transition-colors truncate">
            {channel.name}
          </div>
          {channel.group && channel.group !== "Uncategorized" && (
            <div className="text-caption text-muted-foreground/90 truncate mt-0.5 uppercase tracking-wider font-medium">
              {channel.group}
            </div>
          )}
        </div>
      </div>

      {/* Status indicator dot */}
      <span
        title={statusLabel}
        className={cn(
          "w-2.5 h-2.5 rounded-full shrink-0",
          STATUS_DOT_CLASSES[status ?? "untested"]
        )}
      />
    </div>
  )
})
