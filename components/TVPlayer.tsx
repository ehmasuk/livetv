
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";

type TVPlayerProps = {
  src: string;
  channelName: string;
};

export default function TVPlayer({
  src,
  channelName,
}: TVPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [hasStarted, setHasStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const startPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video || isLoading) return;

    setError("");
    setHasStarted(true);
    setIsLoading(true);

    try {
      await video.play();
    } catch {
      setIsLoading(false);
      setIsPlaying(false);
      setError(
        "Unable to start playback. The stream may be unavailable or blocked."
      );
    }
  }, [isLoading]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let hls: Hls | null = null;
    let cancelled = false;

    setHasStarted(false);
    setIsPlaying(false);
    setIsLoading(false);
    setError("");

    video.pause();
    video.removeAttribute("src");
    video.load();

    const onPlaying = () => {
      setIsPlaying(true);
      setIsLoading(false);
      setError("");
    };

    const onWaiting = () => {
      if (hasStarted) {
        setIsLoading(true);
      }
    };

    const onCanPlay = () => {
      setIsLoading(false);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    const onVideoError = () => {
      if (!cancelled && video.error) {
        setIsLoading(false);
        setIsPlaying(false);
        setError("This stream could not be played. Please try again.");
      }
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("error", onVideoError);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    } else if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        capLevelToPlayerSize: true,
        startLevel: -1,
        maxBufferLength: 15,
        maxMaxBufferLength: 30,
        manifestLoadingMaxRetry: 3,
        levelLoadingMaxRetry: 3,
        fragLoadingMaxRetry: 4,
      });

      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (cancelled || !data.fatal) return;

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls?.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
        } else {
          setIsLoading(false);
          setIsPlaying(false);
          setError(
            "This stream is unavailable or unsupported. Try another channel."
          );
          hls?.destroy();
          hls = null;
          hlsRef.current = null;
        }
      });
    } else {
      setError("Your browser does not support this stream format.");
    }

    return () => {
      cancelled = true;

      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("error", onVideoError);

      hls?.destroy();
      hlsRef.current = null;

      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [src]);

  const handlePlayClick = () => {
    void startPlayback();
  };

  const handleRetry = () => {
    const video = videoRef.current;
    if (!video) return;

    setError("");
    setIsLoading(true);

    if (hlsRef.current) {
      hlsRef.current.stopLoad();
      hlsRef.current.startLoad();
    }

    video.load();
    void video.play().catch(() => {
      setIsLoading(false);
      setError("Unable to play this stream. Please try again.");
    });
  };

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          controls={hasStarted && !error}
          playsInline
          preload="none"
          className="h-full w-full bg-black object-contain"
          aria-label={`Live stream: ${channelName}`}
        />

        {!hasStarted && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900/50 to-black/80">
            <button
              onClick={handlePlayClick}
              aria-label={`Play ${channelName}`}
              className="group flex h-20 w-20 items-center justify-center rounded-full border border-white/30 bg-red-600 text-white shadow-xl shadow-red-600/20 transition duration-200 hover:scale-110 hover:bg-red-500 focus:outline-none focus:ring-4 focus:ring-red-400/50 sm:h-24 sm:w-24"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="ml-1 h-9 w-9 sm:h-11 sm:w-11"
                aria-hidden="true"
              >
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </button>

            <p className="mt-5 text-sm font-semibold text-white">
              Watch {channelName}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Click to start streaming
            </p>
          </div>
        )}

        {isLoading && hasStarted && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-red-500" />
            <p className="mt-4 text-sm text-white">
              Connecting to stream...
            </p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-6 text-center">
            <p className="max-w-md text-sm text-red-300">{error}</p>

            <button
              onClick={handleRetry}
              className="mt-4 rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 py-3">
        <span
          className={`h-2 w-2 rounded-full ${
            isPlaying ? "animate-pulse bg-red-500" : "bg-zinc-500"
          }`}
        />
        <span className="truncate text-sm font-medium text-white">
          {channelName}
        </span>

        <span className="ml-auto text-xs text-zinc-400">
          {isPlaying ? "LIVE" : isLoading ? "LOADING" : "READY"}
        </span>
      </div>
    </div>
  );
}
