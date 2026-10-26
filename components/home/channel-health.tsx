"use client"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { StreamHealthCounts } from "@/hooks/use-lazy-stream-tester"
import { cn } from "@/lib/utils"
import { Activity, Info, RotateCw } from "lucide-react"

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
  return (
    <section className="glass-panel rounded-2xl border border-border p-4 shadow-sm">
      <div className="flex flex-col items-center justify-between gap-4 md:flex-row md:items-start">
        {/* Left: Label with Info Tooltip */}
        <div className="relative flex items-center gap-2 w-full md:w-auto">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-500">
            <Activity className="h-4 w-4" />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider text-foreground uppercase">
              Channel Health Checker
            </span>

            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground transition hover:text-red-500" />
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="w-72 text-[11px] leading-relaxed"
              >
                Channels are checked regularly to make sure they work.
                Unavailable channels are filtered out, and results are saved to
                make things faster.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Right: Modern Stats Pills + Retest Button */}
        <div className="flex w-full flex-wrap items-center justify-between gap-3 md:w-auto">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">
              Total:
            </span>
            <span className="text-sm font-extrabold text-foreground">
              {counts.total}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 dark:bg-emerald-950/30">
            <span className="text-[10px] font-semibold text-emerald-600 uppercase dark:text-emerald-400">
              Working:
            </span>
            <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
              {counts.working}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 dark:bg-rose-950/30">
            <span className="text-[10px] font-semibold text-rose-600 uppercase dark:text-rose-400">
              Failed:
            </span>
            <span className="text-sm font-extrabold text-rose-600 dark:text-rose-400">
              {counts.failed}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 dark:bg-amber-950/30">
            <span className="text-[10px] font-semibold text-amber-600 uppercase dark:text-amber-400">
              Untested:
            </span>
            <span className="text-sm font-extrabold text-amber-600 dark:text-amber-400">
              {counts.pending}
            </span>
          </div>

          <Button
            type="button"
            onClick={onRetestAll}
            disabled={disabled || isTesting}
            aria-label="Retest all channels"
            variant="destructive"
            size="sm"
            className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500 hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.4)] md:whitespace-nowrap"
          >
            <RotateCw className={cn("h-3.5 w-3.5", isTesting && "animate-spin")} />
            <span>Retest channels</span>
          </Button>
        </div>
      </div>
    </section>
  )
}
