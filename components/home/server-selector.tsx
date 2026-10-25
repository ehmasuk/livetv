"use client"

import { RadioTower } from "lucide-react"
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
    <div className="mb-5 rounded-xl border border-white/10 bg-[#101014] p-4">
      <h2 className="mb-3 text-sm font-bold tracking-wider text-zinc-400 uppercase">
        Select server
      </h2>

      <div className="space-y-2">
        {servers.map((server) => {
          const active = selectedServerId === server.id

          return (
            <button
              type="button"
              key={server.id}
              onClick={() => onSelect(server.id)}
              aria-pressed={active}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition",
                active
                  ? "border-red-500 bg-red-500/10"
                  : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/5"
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#25252c] text-zinc-300">
                <RadioTower className="h-5 w-5" aria-hidden="true" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {server.name}
                </span>
                <span className="mt-1 block text-xs text-zinc-500">
                  {server.description}
                </span>
              </span>

              {active && (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
