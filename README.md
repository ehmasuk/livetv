# Live Streaming Platform

A Next.js app that aggregates public IPTV playlists, lets you browse and search channels, and probes streams in the browser to show which ones are working.

**Live demo:** [https://livetvfree.vercel.app/](https://livetvfree.vercel.app/)

## Features

- Multiple playlist sources configured in one place (`config/servers.json`)
- Server-side M3U parsing with caching, size limits, and sports filtering
- Browser-based stream health checks (probes streams to show which ones are working)
- HLS playback with `hls.js` and native HLS fallback
- Search, per-channel status indicators, and channel health dashboard
- Lazy stream testing with adaptive concurrency for desktop and mobile
- PWA support with offline app shell
- Dark mode / theme toggle
- Responsive dashboard with video player and channel sidebar

## Stack

- [Next.js 16](https://nextjs.org/) (App Router, API Routes)
- [TypeScript](https://www.typescriptlang.org/)
- [React 19](https://react.dev/)
- [hls.js](https://github.com/video-dev/hls.js/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [@base-ui/react](https://base-ui.dev/)
- [next-themes](https://github.com/pacocoursey/next-themes)
- [Lucide React](https://lucide.dev/)

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
  manifest.ts             Web app manifest (PWA)
components/
  home/                   Dashboard, player, channel list, health checker
  tv-player.tsx           HLS video player with reconnect logic
  ui/                     Base UI primitives (button, tooltip)
  logo.tsx
  site-header.tsx
  site-footer.tsx
  theme-provider.tsx
  theme-toggle.tsx
  pwa-register.tsx
config/
  servers.json            Playlist source configuration
hooks/
  use-channels.ts         Loads and normalizes a server's channels
  use-lazy-stream-tester.ts Batched stream health checks
  use-wake-lock.ts        Keeps screen awake during playback
lib/
  channels.ts             Pure channel filtering and search helpers
  hls.ts                  Shared hls.js configuration
  playlist.ts             M3U parser
  servers.ts              Server config validation and lookup
  stream-test.ts          Browser stream probe
  types.ts                Shared types
  prefs.ts                localStorage preferences (server, quality, bandwidth)
  constants/
    app.ts                App name and description
    playlist.ts           Playlist fetch and size limits
    stream.ts             Stream health testing constants
    player.ts             Player timing and recovery constants
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
- `category` is `all` for mixed playlists or `sports` to keep only channels whose name or group matches a sports keyword.
- Upstream URLs stay on the server; the browser only receives `id`, `name`, and `description`.
- Parsed playlists are cached for one hour.

## API

```text
GET /api/channels?id=iptv-org-sports
```

Returns an array of channels. Errors use `{ "error": "message" }` with status `404` (unknown server), `503` (disabled server), or `502` (upstream failure).

## Notes

Stream testing runs in the visitor's browser, so availability depends on their network and on whether a stream allows browser access. Test results are temporary and reset on refresh.

## Deployment

The project is deployed on Vercel: [https://livetvfree.vercel.app/](https://livetvfree.vercel.app/)

```bash
pnpm build
pnpm start
```
