import type { MetadataRoute } from "next"
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants"

/**
 * Web app manifest for installability. The icon files must be provided in
 * `public/` (they are not committed): `icon-192.png` (192×192) and
 * `icon-512.png` (512×512). If the artwork is not safe for maskable display,
 * replace `purpose` with `"any"` and add dedicated maskable icons.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — Live TV Streams`,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
