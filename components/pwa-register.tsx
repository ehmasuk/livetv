"use client"

import { useEffect } from "react"

/**
 * Registers the static service worker (`/sw.js`) once per session in
 * production builds. Development builds skip registration so hot reloading
 * and local asset fetching are never intercepted by a cache.
 */
export function PwaRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return

    if (
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }

    // Register after load so first paint is never competed with.
    if (document.readyState === "complete") {
      register()

      return
    }

    window.addEventListener("load", register, { once: true })

    return () => window.removeEventListener("load", register)
  }, [])

  return null
}
