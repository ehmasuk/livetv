"use client"

import { useState } from "react"
import { Activity, Info, RotateCw, ShieldCheck } from "lucide-react"
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
  const [showInfo, setShowInfo] = useState(false)

  return (
    <section className="glass-panel rounded-xl p-3 border border-border">
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: Label with Interactive Info Tooltip */}
        <div className="flex items-center gap-2 relative">
          <div className="w-7 h-7 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 border border-red-500/20">
            <Activity className="w-4 h-4" />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-extrabold uppercase tracking-wider text-foreground">
              Channel Health Checker
            </span>

            {/* Hover / Click Info Tooltip */}
            <div
              className="relative cursor-pointer"
              onMouseEnter={() => setShowInfo(true)}
              onMouseLeave={() => setShowInfo(false)}
              onClick={() => setShowInfo((prev) => !prev)}
              role="button"
              tabIndex={0}
              aria-label="Health checker information"
            >
              <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500 transition" />

              {showInfo && (
                <div className="absolute left-1/2 -translate-x-1/2 md:left-0 md:translate-x-0 top-6 z-50 w-72 p-3 bg-card border border-border rounded-xl shadow-2xl text-[11px] text-muted-foreground leading-relaxed pointer-events-none">
                  <div className="font-bold text-foreground mb-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-red-500" />
                    Automated Background Verification
                  </div>
                  Channels are tested periodically using browser network checks to filter out offline or geo-restricted streams automatically.
                  Results are cached locally.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Modern Stats Pills + Retest Button */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between">
          <div className="flex items-center gap-1.5 bg-muted/80 border border-border px-2.5 py-1 rounded">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase">Total:</span>
            <span className="text-xs font-extrabold text-foreground">{counts.total}</span>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-500/10 dark:bg-emerald-950/30 border border-emerald-500/20 px-2.5 py-1 rounded">
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase">Working:</span>
            <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">{counts.working}</span>
          </div>

          <div className="flex items-center gap-1.5 bg-rose-500/10 dark:bg-rose-950/30 border border-rose-500/20 px-2.5 py-1 rounded">
            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold uppercase">Failed:</span>
            <span className="text-xs font-extrabold text-rose-600 dark:text-rose-400">{counts.failed}</span>
          </div>

          <div className="flex items-center gap-1.5 bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/20 px-2.5 py-1 rounded">
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase">Untested:</span>
            <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400">{counts.pending}</span>
          </div>


        </div>

          {/* Retest Button */}
          <button
            type="button"
            onClick={onRetestAll}
            disabled={disabled || isTesting}
            aria-label="Retest all channels"
            className="px-3 py-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg transition active:scale-95 flex items-center gap-1.5 shadow-md shadow-red-600/20"
          >
            <RotateCw className={cn("w-3 h-3", isTesting && "animate-spin")} />
            <span>Retest channels</span>
          </button>
      </div>
    </section>
  )
}

