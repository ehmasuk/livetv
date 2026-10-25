"use client"

import { memo, useState } from "react"
import { Tv } from "lucide-react"
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
  // `unsupported` is required by the Record keys but never shown in the list:
  // unsupported channels are never part of the working list.
  unsupported: "Unsupported",
  untested: "Untested",
}

const STATUS_DOT_CLASSES: Record<ChannelStatus | "untested", string> = {
  working: "bg-emerald-400",
  failed: "bg-red-500",
  testing: "animate-pulse bg-amber-300",
  unsupported: "bg-sky-400",
  untested: "bg-zinc-600",
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
        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition",
        selected
          ? "border-red-500 bg-red-500/10"
          : "border-white/5 bg-[#101014] hover:border-white/20 hover:bg-[#19191f]"
      )}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#25252c]">
        {showLogo ? (
          // Channel logos come from arbitrary playlist hosts, so the Next.js
          // image optimizer cannot be used without proxying every host.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={channel.logo}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            width={44}
            height={44}
            className="h-full w-full object-contain p-1"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <Tv className="h-5 w-5 text-zinc-500" aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{channel.name}</p>
        <p className="mt-1 truncate text-xs text-zinc-500">{channel.group}</p>
      </div>

      <span
        title={statusLabel}
        className={cn(
          "h-2.5 w-2.5 shrink-0 rounded-full",
          STATUS_DOT_CLASSES[status ?? "untested"]
        )}
      />
    </button>
  )
})
