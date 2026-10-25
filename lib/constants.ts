export const APP_NAME = "Sports TV"
export const APP_DESCRIPTION =
  "Browse live sports channels from multiple public playlists and test which streams work in your browser."

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
