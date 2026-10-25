# Sports TV

A Next.js app that aggregates public IPTV sports playlists, lets you browse
and search channels, and probes streams in the browser to show which ones are
working.

## Features

- Multiple playlist sources configured in one place
- Server-side M3U parsing with caching, size limits, and sports filtering
- Browser-based stream health checks (3 concurrent, 10-second timeout)
- HLS playback with `hls.js` and native HLS fallback
- Search, status filters, and per-channel status indicators

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command           | Description                     |
| ----------------- | ------------------------------- |
| `pnpm dev`        | Start the development server    |
| `pnpm build`      | Create a production build       |
| `pnpm start`      | Run the production build        |
| `pnpm lint`       | Run ESLint                      |
| `pnpm typecheck`  | Run the TypeScript compiler     |
| `pnpm format`     | Format TypeScript files         |

## Project structure

```text
app/
  api/channels/route.ts   Playlist API endpoint
  layout.tsx              Root layout, fonts, and metadata
  page.tsx                Server-rendered page shell
components/
  home/                   Dashboard, player, channel list, health checker
  tv-player.tsx           HLS video player
  ui/                     shadcn/ui primitives
config/
  servers.json            Playlist source configuration
hooks/
  use-channels.ts         Loads and normalizes a server's channels
  use-stream-tester.ts    Batched stream health checks
lib/
  channels.ts             Pure filtering and status-count helpers
  hls.ts                  Shared hls.js configuration
  playlist.ts             M3U parser
  servers.ts              Server config validation and lookup
  stream-test.ts          Browser stream probe
  types.ts                Shared types
```

## Adding a server

Add an entry to `config/servers.json`:

```json
{
  "id": "my-server",
  "name": "My Server",
  "description": "Short description shown in the UI",
  "enabled": true,
  "category": "sports",
  "url": "https://example.com/playlist.m3u"
}
```

- `id` must be unique and is used by the API.
- `category` is `all` for mixed playlists or `sports` to keep only channels
  whose name or group matches a sports keyword.
- Upstream URLs stay on the server; the browser only receives `id`, `name`,
  and `description`.
- Parsed playlists are cached for one hour.

## API

```text
GET /api/channels?id=iptv-org-sports
```

Returns an array of channels. Errors use `{ "error": "message" }` with status
`404` (unknown server), `503` (disabled server), or `502` (upstream failure).

## Notes

Stream testing runs in the visitor's browser, so availability depends on their
network and on whether a stream allows browser access. Test results are
temporary and reset on refresh.
