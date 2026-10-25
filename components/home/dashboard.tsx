"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChannelBrowser } from "@/components/home/channel-browser"
import { ChannelHealth } from "@/components/home/channel-health"
import { ChannelPlayer } from "@/components/home/channel-player"
import type { PlaybackNotice } from "@/components/home/channel-player"
import { ServerSelector } from "@/components/home/server-selector"
import { useChannels } from "@/hooks/use-channels"
import { useLazyStreamTester } from "@/hooks/use-lazy-stream-tester"
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

  const tester = useLazyStreamTester(server.id, channels, search)
  const consecutiveFailsRef = useRef(0)

  const resetNotice = useCallback(() => {
    setNotice(null)
    consecutiveFailsRef.current = 0
  }, [])

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

    if (selectedChannel) tester.reportPlayback(selectedChannel.id, true)
  }, [tester, selectedChannel])

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

  useEffect(() => {
    if (!notice || notice.terminal) return

    const timer = setTimeout(() => setNotice(null), 4500)

    return () => clearTimeout(timer)
  }, [notice])

  return (
    <>
      <section className="min-w-0">
        <div className="mb-5">
          <p className="mb-2 text-xs font-bold tracking-[0.25em] text-red-400 uppercase">
            Your sports destination
          </p>

          <h1 className="text-3xl font-black sm:text-4xl">Watch Sports Live</h1>

          <p className="mt-2 text-sm text-zinc-400">
            Working channels are found and kept for you automatically.
          </p>
        </div>

        <ChannelPlayer
          channel={selectedChannel}
          notice={notice}
          attemptToken={attemptToken}
          onPlaybackWorking={handlePlaybackWorking}
          onPlaybackFailed={handlePlaybackFailed}
          onRetry={handleRetry}
        />

        <ChannelHealth
          counts={tester.counts}
          isTesting={tester.isTesting}
          disabled={loading || tester.counts.total === 0}
          onRetestAll={handleRetestAll}
        />
      </section>

      <aside className="min-w-0">
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
          selectedChannelId={selectedChannel?.id ?? null}
          onSelect={handleSelect}
        />
      </aside>
    </>
  )
}
