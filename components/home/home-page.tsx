"use client"

import { useCallback, useEffect, useState } from "react"
import { Dashboard } from "@/components/home/dashboard"
import { DEFAULT_SERVER_ID } from "@/lib/servers"
import { readSessionPrefs, writeSessionPrefs } from "@/lib/prefs"
import type { ServerOption } from "@/lib/types"

type HomePageProps = {
  servers: ServerOption[]
}

export function HomePage({ servers }: HomePageProps) {
  const [selectedServerId, setSelectedServerId] = useState(
    DEFAULT_SERVER_ID || (servers[0]?.id ?? "")
  )

  // Restore the last used server after mount: the first paint stays
  // identical to the server-rendered markup, then the choice is restored.
  useEffect(() => {
    const stored = readSessionPrefs().serverId

    if (stored && servers.some((server) => server.id === stored)) {
      queueMicrotask(() => setSelectedServerId(stored))
    }
  }, [servers])

  const handleSelectServer = useCallback((serverId: string) => {
    setSelectedServerId(serverId)
    writeSessionPrefs({ serverId })
  }, [])

  const selectedServer =
    servers.find((server) => server.id === selectedServerId) ?? servers[0]

  if (!selectedServer) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-zinc-400">
        No enabled servers are configured.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <Dashboard
        key={selectedServer.id}
        servers={servers}
        server={selectedServer}
        onSelectServer={handleSelectServer}
      />
    </div>
  )
}
