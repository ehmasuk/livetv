
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import TVPlayer from "@/components/TVPlayer";

type Channel = {
  id: string;
  name: string;
  logo: string;
  group: string;
  url: string;
};

type Status = "working" | "failed" | "testing";
type Filter = "all" | "working" | "failed" | "untested";

type ServerOption = {
  id: string;
  name: string;
  description: string;
};

const SERVERS: ServerOption[] = [
  {
    id: "iptv-org-sports",
    name: "IPTV-org Sports",
    description: "Sports channels",
  },
  {
    id: "mrgify-bdix",
    name: "Mrgify BDIX",
    description: "Mrgify playlist",
  },
];

const DEFAULT_SERVER = "iptv-org-sports";
const TEST_TIMEOUT = 10000;
const BATCH_SIZE = 3;

function testStream(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const video = document.createElement("video");

    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";

    Object.assign(video.style, {
      position: "fixed",
      width: "2px",
      height: "2px",
      left: "-10px",
      bottom: "0",
      opacity: "0.01",
      pointerEvents: "none",
    });

    document.body.appendChild(video);

    let hls: Hls | null = null;
    let finished = false;
    let timer: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      clearTimeout(timer);

      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
      video.removeEventListener("loadedmetadata", onMetadata);

      hls?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    };

    const finish = (success: boolean) => {
      if (finished) return;

      finished = true;
      cleanup();
      resolve(success);
    };

    const onPlaying = () => finish(true);
    const onError = () => finish(false);

    const onMetadata = () => {
      void video.play().catch(() => finish(false));
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);

    timer = setTimeout(() => finish(false), TEST_TIMEOUT);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.addEventListener("loadedmetadata", onMetadata);
      video.src = url;
      video.load();
    } else if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        maxBufferLength: 5,
        maxMaxBufferLength: 10,
        manifestLoadingMaxRetry: 0,
        levelLoadingMaxRetry: 0,
        fragLoadingMaxRetry: 0,
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => finish(false));
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) finish(false);
      });

      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      finish(false);
    }
  });
}

export default function Home() {
  const [selectedServer, setSelectedServer] =
    useState(DEFAULT_SERVER);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [selected, setSelected] = useState<Channel | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [statuses, setStatuses] =
    useState<Record<string, Status>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [isTesting, setIsTesting] = useState(false);
  const [progress, setProgress] = useState({
    done: 0,
    total: 0,
  });

  const stopRef = useRef(false);

  const currentServer = SERVERS.find(
    (server) => server.id === selectedServer
  ) ?? SERVERS[0];

  // Load channels only from the selected server.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadChannels() {
      setLoading(true);
      setMessage("");

      try {
        const response = await fetch(
          `/api/channels?id=${encodeURIComponent(selectedServer)}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error("Could not load channels");
        }

        const data: Channel[] = await response.json();

        if (!active) return;

        // Remove duplicate stream URLs.
        const seen = new Set<string>();

        const unique = data.filter((channel) => {
          if (!/^https?:\/\//i.test(channel.url)) {
            return false;
          }

          const key = channel.url.trim();

          if (seen.has(key)) return false;

          seen.add(key);
          return true;
        });

        setChannels(unique);

        setMessage(
          unique.length
            ? ""
            : "No valid channels were found in this playlist."
        );
      } catch (error) {
        if (!active || controller.signal.aborted) return;

        console.error("Channel loading failed:", error);

        setMessage(
          "Could not load channels. Please refresh and try again."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadChannels();

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedServer]);

  // Switch sources and clear source-specific state.
  function switchServer(serverId: string) {
    if (serverId === selectedServer) return;

    stopRef.current = true;

    setSelectedServer(serverId);
    setChannels([]);
    setSelected(null);
    setStatuses({});
    setSearch("");
    setFilter("all");
    setMessage("");
    setProgress({ done: 0, total: 0 });
  }

  const counts = useMemo(() => {
    const working = Object.values(statuses).filter(
      (status) => status === "working"
    ).length;

    const failed = Object.values(statuses).filter(
      (status) => status === "failed"
    ).length;

    const testing = Object.values(statuses).filter(
      (status) => status === "testing"
    ).length;

    return {
      working,
      failed,
      testing,
      untested: channels.length - working - failed - testing,
    };
  }, [channels.length, statuses]);

  const filteredChannels = useMemo(() => {
    const query = search.trim().toLowerCase();

    return channels.filter((channel) => {
      const matchesSearch =
        channel.name.toLowerCase().includes(query) ||
        channel.group.toLowerCase().includes(query);

      const status = statuses[channel.id];

      const matchesFilter =
        filter === "all" ||
        (filter === "working" && status === "working") ||
        (filter === "failed" && status === "failed") ||
        (filter === "untested" && !status);

      return matchesSearch && matchesFilter;
    });
  }, [channels, search, filter, statuses]);

  async function runTests() {
    if (isTesting) {
      stopRef.current = true;
      return;
    }

    stopRef.current = false;
    setIsTesting(true);

    const queue = channels.filter(
      (channel) => statuses[channel.id] !== "working"
    );

    setProgress({ done: 0, total: queue.length });

    let done = 0;

    try {
      for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        if (stopRef.current) break;

        const batch = queue.slice(i, i + BATCH_SIZE);

        setStatuses((previous) => {
          const next = { ...previous };

          for (const channel of batch) {
            next[channel.id] = "testing";
          }

          return next;
        });

        const results = await Promise.all(
          batch.map(async (channel) => ({
            id: channel.id,
            working: await testStream(channel.url),
          }))
        );

        if (stopRef.current) {
          setStatuses((previous) => {
            const next = { ...previous };

            for (const channel of batch) {
              if (next[channel.id] === "testing") {
                delete next[channel.id];
              }
            }

            return next;
          });

          break;
        }

        setStatuses((previous) => {
          const next = { ...previous };

          for (const result of results) {
            next[result.id] = result.working
              ? "working"
              : "failed";
          }

          return next;
        });

        done += batch.length;
        setProgress({ done, total: queue.length });
      }
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#09090b] text-white">
      <header className="border-b border-white/10 bg-[#101014]">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-5">
          <a href="/" className="text-2xl font-black tracking-tight">
            <span className="text-red-500">SPORTS</span> TV
          </a>

          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">
            FREE SPORTS STREAMS
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <div className="mb-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-red-400">
              Your sports destination
            </p>

            <h1 className="text-3xl font-black sm:text-4xl">
              Watch Sports Live
            </h1>

            <p className="mt-2 text-sm text-zinc-400">
              Test streams to find channels that work in your browser.
            </p>
          </div>

          {selected ? (
            <TVPlayer
              key={selected.id}
              src={selected.url}
              channelName={selected.name}
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-2xl border border-white/10 bg-[#15151b] p-6 text-center">
              <div>
                <div className="mb-3 text-4xl">▶</div>
                <p className="font-semibold">Choose a channel</p>
                <p className="mt-2 text-sm text-zinc-500">
                  Select a channel to open its player.
                </p>
              </div>
            </div>
          )}

          <div className="mt-5 rounded-xl border border-white/10 bg-[#101014] p-4">
            <h2 className="font-semibold">Channel health checker</h2>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Test unverified and failed channels. Three streams are
              tested concurrently, with a maximum of ten seconds per
              stream. Testing uses your browser and internet connection.
            </p>

            <button
              onClick={() => void runTests()}
              disabled={loading || channels.length === 0}
              className="mt-4 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isTesting
                ? "Stop testing"
                : counts.failed > 0
                  ? "Retry unverified and failed channels"
                  : "Test channels"}
            </button>

            {isTesting && (
              <div className="mt-4">
                <div className="mb-2 flex justify-between text-xs text-zinc-400">
                  <span>Testing streams...</span>
                  <span>
                    {progress.done} / {progress.total}
                  </span>
                </div>

                <div
                  className="h-2 overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                  aria-valuenow={progress.done}
                >
                  <div
                    className="h-full rounded-full bg-red-500 transition-all"
                    style={{
                      width: `${
                        progress.total
                          ? (progress.done / progress.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: "Total",
                  value: channels.length,
                  color: "text-white",
                },
                {
                  label: "Working",
                  value: counts.working,
                  color: "text-emerald-400",
                },
                {
                  label: "Failed",
                  value: counts.failed,
                  color: "text-red-400",
                },
                {
                  label: "Untested",
                  value: counts.untested + counts.testing,
                  color: "text-amber-300",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-white/10 bg-black/20 p-3"
                >
                  <p className="text-xs text-zinc-500">{item.label}</p>
                  <p
                    className={`mt-1 text-2xl font-black ${item.color}`}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs text-zinc-500">
              Results are temporary and reset when the page is refreshed.
              A failed test may also mean the stream blocks browser access.
            </p>
          </div>
        </section>

        <aside className="min-w-0">
          <div className="mb-5 rounded-xl border border-white/10 bg-[#101014] p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">
              Select server
            </h2>

            <div className="space-y-2">
              {SERVERS.map((server) => {
                const active = selectedServer === server.id;

                return (
                  <button
                    key={server.id}
                    onClick={() => switchServer(server.id)}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-red-500 bg-red-500/10"
                        : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/5"
                    }`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#25252c] text-lg">
                      📡
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
                );
              })}
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Sports Channels</h2>
            <span className="text-sm text-zinc-500">
              {filteredChannels.length}
            </span>
          </div>

          <p className="mb-3 text-xs text-zinc-500">
            Source: {currentServer.name}
          </p>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search channels..."
            className="mb-3 w-full rounded-xl border border-white/10 bg-[#15151b] px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-red-500"
            aria-label="Search channels"
          />

          <div className="mb-4 flex flex-wrap gap-2">
            {(
              [
                ["all", "All"],
                ["working", "Working"],
                ["failed", "Failed"],
                ["untested", "Untested"],
              ] as [Filter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                  filter === value
                    ? "bg-red-600 text-white"
                    : "bg-white/5 text-zinc-400 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[650px] space-y-2 overflow-y-auto pr-1">
            {loading && (
              <p className="py-8 text-center text-sm text-zinc-400">
                Loading {currentServer.name} channels...
              </p>
            )}

            {!loading && message && (
              <p className="py-8 text-center text-sm text-zinc-400">
                {message}
              </p>
            )}

            {!loading &&
              !message &&
              filteredChannels.length === 0 && (
                <p className="py-8 text-center text-sm text-zinc-400">
                  No channels match this filter.
                </p>
              )}

            {filteredChannels.map((channel) => {
              const status = statuses[channel.id];
              const isSelected = selected?.id === channel.id;

              return (
                <button
                  key={channel.id}
                  onClick={() => setSelected(channel)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? "border-red-500 bg-red-500/10"
                      : "border-white/5 bg-[#101014] hover:border-white/20 hover:bg-[#19191f]"
                  }`}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#25252c]">
                    {channel.logo ? (
                      <img
                        src={channel.logo}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-contain p-1"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <span className="text-lg">📺</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {channel.name}
                    </p>
                    <p className="mt-1 truncate text-xs text-zinc-500">
                      {channel.group}
                    </p>
                  </div>

                  <span
                    title={status ?? "Untested"}
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      status === "working"
                        ? "bg-emerald-400"
                        : status === "failed"
                          ? "bg-red-500"
                          : status === "testing"
                            ? "animate-pulse bg-amber-300"
                            : "bg-zinc-600"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      <footer className="border-t border-white/10 px-5 py-6 text-center text-xs text-zinc-500">
        Independent sports-stream directory · Stream availability is not guaranteed.
      </footer>
    </main>
  );
}
