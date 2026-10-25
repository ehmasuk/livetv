"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChannelBrowser } from "@/components/home/channel-browser"
import { ChannelHealth } from "@/components/home/channel-health"
import { ChannelPlayer } from "@/components/home/channel-player"
import type { PlaybackNotice } from "@/components/home/channel-player"
import { ServerSelector } from "@/components/home/server-selector"
import { useChannels } from "@/hooks/use-channels"
import { useLazyStreamTester } from "@/hooks/use-lazy-stream-tester"
import { readSessionPrefs, writeSessionPrefs } from "@/lib/prefs"
import type { Channel, ServerOption } from "@/lib/types"

type DashboardProps = {
  servers: ServerOption[]
  server: ServerOption
  onSelectServer: (serverId: string) => void
}

/** Failed channels in a row before auto-advancing stops and an error shows. */
const MAX_PLAYBACK_ATTEMPTS = 3

/** Next working channel after `failedId`, or null when there is none. */
function nextWorkingChannel(workingChannels: Channel[], failedId: string) {
  if (workingChannels.length <= 1) return null

  const index = workingChannels.findIndex((channel) => channel.id === failedId)

  if (index < 0) return workingChannels[0]

  const next = workingChannels[(index + 1) % workingChannels.length]

  return next.id === failedId ? null : next
}

export function Dashboard({ server, servers, onSelectServer }: DashboardProps) {
  const { channels, loading, error } = useChannels(server.id)
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)
  const [search, setSearch] = useState("")
  const [notice, setNotice] = useState<PlaybackNotice | null>(null)
  const [attemptToken, setAttemptToken] = useState(0)
  /** Last played channel of this server, only used for a highlight. */
  const [rememberedChannelId, setRememberedChannelId] = useState<string | null>(
    null
  )

  const tester = useLazyStreamTester(server.id, channels, search)
  const consecutiveFailsRef = useRef(0)

  const resetNotice = useCallback(() => {
    setNotice(null)
    consecutiveFailsRef.current = 0
  }, [])

  // Restores the last played channel of this server as a highlight only —
  // nothing auto-plays on load.
  useEffect(() => {
    const prefs = readSessionPrefs()
    const channelId =
      prefs.serverId === server.id ? (prefs.channelId ?? null) : null

    queueMicrotask(() => setRememberedChannelId(channelId))
  }, [server.id])

  // Keeps the typed search term for the next visit; it is not re-applied.
  useEffect(() => {
    writeSessionPrefs({ search })
  }, [search])

  // A fresh manual pick always starts a new streak.
  const handleSelect = useCallback(
    (channel: Channel) => {
      resetNotice()
      setSelectedChannel(channel)
    },
    [resetNotice]
  )

  const handlePlaybackWorking = useCallback(() => {
    consecutiveFailsRef.current = 0

    if (selectedChannel) {
      tester.reportPlayback(selectedChannel.id, true)
      writeSessionPrefs({ serverId: server.id, channelId: selectedChannel.id })
    }
  }, [tester, selectedChannel, server.id])

  const handlePlaybackActiveChange = useCallback(
    (active: boolean) => {
      tester.setPlaybackActive(active)
    },
    [tester]
  )

  /**
   * Escape hatch for the player's "connection too slow" banner: advances
   * to the next working channel without counting a failure (the channel
   * was too slow, not broken) and without touching the failure streak.
   */
  const handleTryAnotherChannel = useCallback(() => {
    if (!selectedChannel) return

    const next = nextWorkingChannel(tester.workingChannels, selectedChannel.id)

    if (!next) {
      setNotice({
        text: "No other working channel was found yet. Try again later.",
      })
      return
    }

    setNotice({ text: "Trying the next working channel..." })
    setSelectedChannel(next)
  }, [selectedChannel, tester.workingChannels])

  const handlePlaybackFailed = useCallback(() => {
    if (!selectedChannel) return

    // Every failing channel is reported, whether or not the user pressed play.
    tester.reportPlayback(selectedChannel.id, false)

    consecutiveFailsRef.current += 1

    if (consecutiveFailsRef.current >= MAX_PLAYBACK_ATTEMPTS) {
      setNotice({
        text: `${MAX_PLAYBACK_ATTEMPTS} channels in a row failed to play in this browser. Try again, or pick a different channel from the list.`,
        terminal: true,
      })
      return
    }

    const next = nextWorkingChannel(tester.workingChannels, selectedChannel.id)

    if (!next) {
      setNotice({
        text: `This channel is unavailable and no other working channel was found yet. Try again, or wait while more channels are tested.`,
        terminal: true,
      })
      return
    }

    setNotice({ text: "Channel unavailable, trying the next one..." })
    setSelectedChannel(next)
  }, [tester, selectedChannel])

  const handleRetry = useCallback(() => {
    consecutiveFailsRef.current = 0
    setAttemptToken((token) => token + 1)
    setNotice(null)
  }, [])

  const handleRetestAll = useCallback(() => {
    tester.retestAll()
  }, [tester])

  /**
   * Warms the stream's origin while the player chunk is still loading:
   * DNS, TCP and the TLS handshake are set up ahead of the player's first
   * manifest request. The hint is replaced with every selection and
   * dropped when the player closes.
   */
  useEffect(() => {
    const url = selectedChannel?.url
    if (!url) return

    let origin: string

    try {
      origin = new URL(url).origin
    } catch {
      return
    }

    const links: HTMLLinkElement[] = []

    for (const rel of ["preconnect", "dns-prefetch"] as const) {
      const link = document.createElement("link")
      link.rel = rel
      link.href = origin

      // The player (and every playlist fetch) runs in CORS mode, so the
      // warmed connection must match that mode to be reused.
      if (rel === "preconnect") link.crossOrigin = "anonymous"

      document.head.appendChild(link)
      links.push(link)
    }

    return () => {
      for (const link of links) link.remove()
    }
  }, [selectedChannel])

  useEffect(() => {
    if (!notice || notice.terminal) return

    const timer = setTimeout(() => setNotice(null), 4500)

    return () => clearTimeout(timer)
  }, [notice])

  // Publishes the sticky player rail's height as a CSS variable so the
  // mobile search bar can stick directly below the player while the page
  // scrolls. Values live on the document root, so the sibling aside can
  // read it too.
  const playerRailRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = playerRailRef.current
    if (!node) return

    const update = () => {
      document.documentElement.style.setProperty(
        "--rb-player-h",
        `${Math.round(node.getBoundingClientRect().height)}px`
      )
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)

    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty("--rb-player-h")
    }
  }, [])

  return (
    <div className="dashboard-grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div
        ref={playerRailRef}
        className="[grid-area:rail] max-lg:sticky max-lg:top-0 max-lg:z-20 bg-[#09090b] pt-[env(safe-area-inset-top)] pb-2"
      >
        <ChannelPlayer
          channel={selectedChannel}
          notice={notice}
          attemptToken={attemptToken}
          onPlaybackWorking={handlePlaybackWorking}
          onPlaybackFailed={handlePlaybackFailed}
          onPlaybackActiveChange={handlePlaybackActiveChange}
          onTryAnotherChannel={handleTryAnotherChannel}
          onRetry={handleRetry}
        />
      </div>

      <section className="[grid-area:main] min-w-0">
        {tester.isOffline && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-200"
          >
            You are offline — channel testing is paused and streams may not
            load. Checking your connection...
          </div>
        )}

        <div className="mb-5">
          <p className="mb-2 text-xs font-bold tracking-[0.25em] text-red-400 uppercase">
            Your sports destination
          </p>

          <h1 className="text-3xl font-black sm:text-4xl">Watch Sports Live</h1>

          <p className="mt-2 text-sm text-zinc-400">
            Working channels are found and kept for you automatically.
          </p>
        </div>

        <ChannelHealth
          counts={tester.counts}
          isTesting={tester.isTesting}
          disabled={loading || tester.counts.total === 0}
          onRetestAll={handleRetestAll}
        />
      </section>

      <aside className="[grid-area:aside] min-w-0">
        <ServerSelector
          servers={servers}
          selectedServerId={server.id}
          onSelect={onSelectServer}
        />

        <ChannelBrowser
          channels={channels}
          workingChannels={tester.workingChannels}
          visibleCount={tester.visibleCount}
          isDone={tester.isDone}
          isScanning={tester.isScanning}
          scanBoosted={tester.scanBoosted}
          statuses={tester.statuses}
          search={search}
          onSearchChange={setSearch}
          onLoadMore={tester.loadMore}
          onBoostScan={tester.boostScan}
          onRetestAll={handleRetestAll}
          loading={loading}
          error={error}
          serverName={server.name}
          selectedChannelId={selectedChannel?.id ?? rememberedChannelId}
          onSelect={handleSelect}
        />
      </aside>
    </div>
  )
}
