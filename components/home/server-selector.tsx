"use client"

import { Radio, Server, Wifi } from "lucide-react"
import { cn } from "@/lib/utils"
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
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 mr-1 flex items-center gap-1">
        <Server className="w-3.5 h-3.5 text-red-500" /> Server:
      </span>

      {servers.map((server, index) => {
        const active = selectedServerId === server.id
        const Icon = index % 2 === 0 ? Radio : Wifi

        return (
          <button
            type="button"
            key={server.id}
            onClick={() => onSelect(server.id)}
            aria-pressed={active}
            className={cn(
              "px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 transition shrink-0",
              active
                ? "border-red-500/60 bg-red-500/10 text-foreground shadow-sm shadow-red-500/20"
                : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Icon className={cn("w-3.5 h-3.5", active && "text-red-500")} />
            <span>{server.name}</span>
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                active ? "bg-red-500 animate-pulse" : "bg-muted-foreground/40"
              )}
            />
          </button>
        )
      })}
    </div>
  )
}

