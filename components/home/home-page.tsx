"use client"

import { useState } from "react"
import { Dashboard } from "@/components/home/dashboard"
import type { ServerOption } from "@/lib/types"

type HomePageProps = {
  servers: ServerOption[]
}

export function HomePage({ servers }: HomePageProps) {
  const [selectedServerId, setSelectedServerId] = useState(servers[0]?.id ?? "")

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
    <div className="mx-auto grid max-w-[1600px] gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Dashboard
        key={selectedServer.id}
        servers={servers}
        server={selectedServer}
        onSelectServer={setSelectedServerId}
      />
    </div>
  )
}
