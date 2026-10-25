export const APP_NAME = "LiveTVFree"
export const APP_DESCRIPTION =
  "Watch live TV channels from public playlists — sports, news, entertainment and more. Browse working channels, test streams in your browser, and find the ones that play."

/** How long a parsed playlist may be reused before it is fetched again. */
export const PLAYLIST_REVALIDATE_SECONDS = 60 * 60

/** How long a stale playlist may still be served while it revalidates. */
export const PLAYLIST_STALE_WHILE_REVALIDATE_SECONDS = 24 * 60 * 60

/** Maximum time allowed for an upstream playlist request. */
export const PLAYLIST_FETCH_TIMEOUT_MS = 15_000

/** Guard against unexpectedly large upstream playlists. */
export const MAX_PLAYLIST_BYTES = 10 * 1024 * 1024

/**
 * localStorage key prefix for per-server stream health results.
 * The full key is `<prefix>:<serverId>`.
 */
export const STREAM_HEALTH_CACHE_PREFIX = "stream-health:v1"

/** Number of channels shown per lazy-loading page step. */
export const STREAM_PAGE_SIZE = 20

/** How many pages of extra working channels are buffered before testing pauses. */
export const STREAM_HEALTH_BUFFER_PAGES = 2

/** Number of streams probed concurrently by the background worker pool. */
export const STREAM_TEST_BATCH_SIZE = 4

/**
 * Number of probes the slow background scan may run. Active work for the
 * visible list (filling, scrolling, search matches) always uses the full
 * `STREAM_TEST_BATCH_SIZE` pool, independent of this lane.
 */
export const STREAM_HEALTH_SCAN_CONCURRENCY = 2

/** Foreground probes on phones, slow connections or metered data. */
export const STREAM_TEST_BATCH_SIZE_LOW_POWER = 2

/** Background scan probes on phones, slow connections or metered data. */
export const STREAM_HEALTH_SCAN_CONCURRENCY_LOW_POWER = 1

/**
 * Battery level under which the background scan pauses while the device is
 * not charging. Foreground work (list filling, search matches) still runs.
 */
export const STREAM_HEALTH_BATTERY_LOW_LEVEL = 0.2

/**
 * Delay before a changed search term reprioritizes the test queue.
 * In-flight tests are never aborted for it.
 */
export const SEARCH_DEBOUNCE_MS = 250

/** Maximum time a single stream probe may take. */
export const STREAM_TEST_TIMEOUT_MS = 6_500

/** How long a confirmed working result is trusted before it is retested. */
export const STREAM_HEALTH_OK_TTL_MS = 2 * 60 * 60 * 1000

/** How long a result failed twice in a row is trusted before it is retested. */
export const STREAM_HEALTH_FAIL_TTL_MS = 12 * 60 * 60 * 1000

/** How long only a single consecutive failure is trusted before a retest. */
export const STREAM_HEALTH_FIRST_FAIL_TTL_MS = 10 * 60 * 1000

/** How long collected results are buffered before they are written to storage. */
export const STREAM_HEALTH_FLUSH_INTERVAL_MS = 3_000

/** Player: buffering must last at least this long before showing an indicator. */
export const PLAYER_BUFFERING_DELAY_MS = 1_000

/** Player: how often the facts-based sampler inspects the video element. */
export const PLAYER_SAMPLE_INTERVAL_MS = 250

/** Player: spinner silence right after our own nudge, jump, quality or reload actions. */
export const PLAYER_ACTION_GRACE_MS = 1_000

/** Player: currentTime not advancing for this long counts as frozen. */
export const PLAYER_FREEZE_CHECK_MS = 4_000

/**
 * Player: while the playhead advances, no newly presented video frame for
 * this long counts as a picture freeze (audio can keep going).
 */
export const PLAYER_FRAME_FREEZE_MS = 4_000

/** Player: quiet wait after each video-freeze rung before checking frames again. */
export const PLAYER_FRAME_FREEZE_RECOVERY_CHECK_MS = 2_500

/** Player: quiet window after a successful video-freeze recovery. */
export const PLAYER_FRAME_FREEZE_COOLDOWN_MS = 10_000

/** Player: full video-freeze ladder runs allowed inside the rolling window. */
export const PLAYER_FRAME_FREEZE_MAX_RUNS = 3

/** Player: rolling window that counts full video-freeze ladder runs. */
export const PLAYER_FRAME_FREEZE_RUN_WINDOW_MS = 60_000

/** Player: tiny self-seek used by the first video-freeze recovery rung. */
export const PLAYER_FRAME_FREEZE_SEEK_S = 0.05

/** Player: silent full reconnects attempted before the error screen. */
export const PLAYER_RECONNECT_MAX = 3

/** Player: delay before each consecutive silent full reconnect. */
export const PLAYER_RECONNECT_DELAYS_MS = [1_000, 3_000, 6_000] as const

/** Player: continuous playback that resets the silent reconnect counter. */
export const PLAYER_RECONNECT_STABLE_RESET_MS = 30_000

/** Player: how far behind live a recovered player may sit before seeking. */
export const PLAYER_LIVE_BEHIND_MAX_S = 45

/** Player: wall-clock gap between watchdog ticks that means the device slept. */
export const PLAYER_WAKE_GAP_MS = 5_000

/** Player: fallback landing offset behind the last seekable range. */
export const PLAYER_LIVE_EDGE_OFFSET_S = 0.5

/** Player: stable playback duration after which the bandwidth estimate is saved. */
export const PLAYER_ESTIMATE_SAVE_DELAY_MS = 10_000

/** Player: width of the rolling window that counts stalls for the suggestions. */
export const PLAYER_STALL_WINDOW_MS = 60_000

/** Player: stalls inside the window that trigger the quality suggestion. */
export const PLAYER_STALL_COUNT_LIMIT = 3

/** Player: no second fatal-error ladder step inside this quiet window. */
export const PLAYER_LADDER_GRACE_MS = 1_500

/**
 * Player: buffered-ahead seconds (measured at the playhead) required
 * before the very first play resumes after the tap gesture.
 */
export const PLAYER_PREBUFFER_TARGET_S = 8

/**
 * Player: prebuffer target when the saved bandwidth estimate is below
 * twice the starting level's bitrate — slow connections get a deeper
 * first buffer instead of an early start.
 */
export const PLAYER_PREBUFFER_TARGET_LOW_BW_S = 12

/** Player: prebuffer target for native HLS, where the browser steers the buffer. */
export const PLAYER_PREBUFFER_TARGET_NATIVE_S = 5

/**
 * Player: hard ceiling on the prebuffer wait. The play starts with
 * whatever has buffered by then — waiting never escalates to a failure.
 */
export const PLAYER_PREBUFFER_MAX_WAIT_MS = 10_000

/** Player: the "Play now" button appears once the prebuffer wait is this old. */
export const PLAYER_PREBUFFER_PLAY_NOW_AT_MS = 3_000

/** Player: prebuffer age at which a too-slow fill drops quality one level. */
export const PLAYER_PREBUFFER_DROP_AT_MS = 5_000

/**
 * Player: the prebuffer counts as too slow when buffered-ahead is below
 * this fraction of the target at `PLAYER_PREBUFFER_DROP_AT_MS`.
 */
export const PLAYER_PREBUFFER_DROP_RATIO = 0.4

/** Player: buffered-ahead seconds a rebuffer hold waits for before resuming. */
export const PLAYER_REBUFFER_TARGET_S = 5

/** Player: ceiling on a rebuffer hold, then playback resumes with what exists. */
export const PLAYER_REBUFFER_MAX_WAIT_MS = 8_000

/** Player: at most one rebuffer pause per this window; later freezes just nudge. */
export const PLAYER_REBUFFER_COOLDOWN_MS = 20_000
