/*
 * Minimal service worker: keeps only the app shell and same-origin static
 * assets cached so the installed app opens offline.
 *
 * Never cached, by design:
 * - /api/* responses (channel playlists stay dynamic)
 * - cross-origin requests (stream URLs, playlists, segments, logos)
 * - anything the browser fetches for video/audio elements, plus media
 *   file extensions, so stream traffic can never be stored
 */
const CACHE = "sports-tv-shell-v1"
const MEDIA_EXTENSIONS = /\.(m3u8|ts|m4s|mp4|aac|mp3|webm)(\?|$)/i

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)

      try {
        await cache.addAll(["/"])
      } catch {
        // Shell caching is best effort; a later visit fills the cache.
      }

      await self.skipWaiting()
    })()
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()

      await Promise.all(
        names
          .filter((name) => name !== CACHE)
          .map((name) => caches.delete(name))
      )

      await self.clients.claim()
    })()
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request

  // Only plain same-origin GETs are ever eligible for caching.
  if (request.method !== "GET") return

  const url = new URL(request.url)

  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/")) return
  if (MEDIA_EXTENSIONS.test(url.pathname)) return

  const destination = request.destination

  if (
    destination === "video" ||
    destination === "audio" ||
    destination === "manifest"
  ) {
    return
  }

  // Navigations: network first, cached app shell as the offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request)

          if (response.ok) {
            const cache = await caches.open(CACHE)

            cache.put("/", response.clone()).catch(() => {})
          }

          return response
        } catch {
          const cache = await caches.open(CACHE)

          return (
            (await cache.match(request)) ||
            (await cache.match("/")) ||
            new Response("Offline", { status: 503 })
          )
        }
      })()
    )

    return
  }

  // Static assets (hashed bundles, icons): cache-first.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request)

      if (cached) return cached

      try {
        const response = await fetch(request)

        if (response.ok && response.type === "basic") {
          const cache = await caches.open(CACHE)

          cache.put(request, response.clone()).catch(() => {})
        }

        return response
      } catch {
        return new Response("Offline", { status: 503 })
      }
    })()
  )
})
