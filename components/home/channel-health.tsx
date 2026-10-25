"use client"

import { cn } from "@/lib/utils"
import type { StreamHealthCounts } from "@/hooks/use-lazy-stream-tester"

type ChannelHealthProps = {
  counts: StreamHealthCounts
  isTesting: boolean
  disabled: boolean
  onRetestAll: () => void
}

export function ChannelHealth({
  counts,
  isTesting,
  disabled,
  onRetestAll,
}: ChannelHealthProps) {
  const stats = [
    { label: "Total", value: counts.total, color: "text-white" },
    { label: "Working", value: counts.working, color: "text-emerald-400" },
    { label: "Failed", value: counts.failed, color: "text-red-400" },
    { label: "Untested", value: counts.pending, color: "text-amber-300" },
  ]

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-[#101014] p-4">
      <h2 className="font-semibold">Channel health checker</h2>

      <p className="mt-2 text-sm leading-6 text-zinc-400">
        Channels are tested automatically in the background while you browse,
        a few at a time, using your browser and internet connection.
      </p>

      <button
        type="button"
        onClick={onRetestAll}
        disabled={disabled || isTesting}
        className="mt-4 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Retest all channels
      </button>

      {isTesting && (
        <p className="mt-2 text-xs text-zinc-400" aria-live="polite">
          <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-amber-300 align-middle" />
          Finding working channels...
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-white/10 bg-black/20 p-3"
          >
            <p className="text-xs text-zinc-500">{item.label}</p>
            <p className={cn("mt-1 text-2xl font-black", item.color)}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        Results are saved in this browser for a few hours. A failed test can
        also mean the stream blocks browser access or is not available in your
        region.
      </p>
    </div>
  )
}
