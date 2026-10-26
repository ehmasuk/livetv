# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

General viewers browsing live TV channels. They open the app to find channels worth watching across sports, news, and entertainment, and their job is to locate a stream that actually plays without wasting time on dead links.

## Product Purpose

LiveTVFree aggregates public IPTV playlists, lets users browse and search channels, and probes streams in the browser to show which ones are working. Success means a visitor finds a playable live stream quickly.

## Positioning

Browser-based stream health probing: it probes streams in the visitor's own browser to show which ones actually play before they commit, a mechanism a directory or aggregator without live testing cannot truthfully copy.

## Operating Context

Visitors open the Next.js web app (installable PWA with offline app shell), choose a playlist source from `config/servers.json`, browse or search channels, check per-channel status indicators, and play via hls.js with native HLS fallback. Dark mode and a responsive dashboard adapt to desktop and mobile. Stream tests run in the visitor's browser; results are temporary and reset on refresh. Availability depends on the visitor's network and whether a stream allows browser access.

## Capabilities and Constraints

Confirmed functionality: multiple playlist sources in one place; server-side M3U parsing with caching (one hour), size limits, and sports filtering; browser-based stream health checks with lazy testing and adaptive concurrency; HLS playback via hls.js plus native HLS fallback; search; per-channel status; channel health dashboard; PWA support; dark mode / theme toggle; responsive layout.

Constraints: public IPTV playlists only — no hosted or proprietary streams; upstream URLs stay server-side and the browser receives only `id`, `name`, and `description`; parsed playlists are cached for one hour; stream test results are temporary and reset on refresh.

Platform: web (mobile web remains web; this is not a native wrapper).

Explicitly undecided product facts: none confirmed.

## Brand Commitments

Name: LiveTVFree. Deployment: Vercel at https://livetvfree.vercel.app/. Product description: "Watch live TV channels from public playlists — sports, news, entertainment and more. Browse working channels, test streams in your browser, and find the ones that play."

## Evidence on Hand

README.md (features, stack, deployment instructions); live demo at https://livetvfree.vercel.app/; source code under `app/`, `components/`, `lib/`, and playlist source config at `config/servers.json`. No testimonials, case studies, benchmarks, or press are on hand — future work must not fabricate them.

## Product Principles

1. Public-only aggregation — only publicly available M3U playlists; no hosted or proprietary streams.
2. Stream-first honesty — show which streams actually work via browser probing before the user commits.
3. Server-side privacy — upstream URLs never leave the server; the browser receives only id, name, and description.
4. Resilient playback — HLS with native fallback, reconnect logic, and lazy testing with adaptive concurrency.

## Accessibility & Inclusion

Dark mode / theme toggle and responsive desktop/mobile layout are product facts; no specific accessibility standard was established.
