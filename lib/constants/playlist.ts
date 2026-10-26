/** How long a parsed playlist may be reused before it is fetched again. */
export const PLAYLIST_REVALIDATE_SECONDS = 60 * 60

/** How long a stale playlist may still be served while it revalidates. */
export const PLAYLIST_STALE_WHILE_REVALIDATE_SECONDS = 24 * 60 * 60

/** Maximum time allowed for an upstream playlist request. */
export const PLAYLIST_FETCH_TIMEOUT_MS = 15_000

/** Guard against unexpectedly large upstream playlists. */
export const MAX_PLAYLIST_BYTES = 10 * 1024 * 1024
