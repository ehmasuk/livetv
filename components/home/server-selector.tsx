"use client"

import { Server } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { ServerOption } from "@/lib/types"

type ServerSelectorProps = {
  servers: ServerOption[]
  selectedServerId: string
  onSelect: (serverId: string) => void
}

export function ServerSelector({
  servers,
  selectedServerId,
  onSelect,
}: ServerSelectorProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-0.5 scrollbar-none flex-wrap">
      <span className="text-caption font-bold uppercase tracking-wider text-muted-foreground shrink-0 mr-2 flex items-center gap-1.5">
        <Server className="w-3.5 h-3.5 text-red-500" /> Source
      </span>

      {servers.map((server) => {
        const active = selectedServerId === server.id

        return (
          <Button
            type="button"
            key={server.id}
            onClick={() => onSelect(server.id)}
            aria-pressed={active}
            className={cn(
              "px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-2 shrink-0 transition-all duration-200",
              active
                ? "border-red-500/60 bg-red-500/10 text-foreground shadow-sm shadow-red-500/20 hover:bg-red-500/15 hover:shadow-red-500/30"
                : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted hover:border-slate-300 dark:hover:border-slate-600"
            )}
          >
            <Server
              className={cn("w-3.5 h-3.5", active && "text-red-500")}
            />
            <span>{server.name}</span>
          </Button>
        )
      })}
    </div>
  )
}
