import { NextResponse } from "next/server"
import {
  MAX_PLAYLIST_BYTES,
  PLAYLIST_FETCH_TIMEOUT_MS,
  PLAYLIST_REVALIDATE_SECONDS,
  PLAYLIST_STALE_WHILE_REVALIDATE_SECONDS,
} from "@/lib/constants"
import { parsePlaylist } from "@/lib/playlist"
import { DEFAULT_SERVER_ID, getServerById } from "@/lib/servers"

export const runtime = "nodejs"

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request: Request) {
  const requestedServerId =
    new URL(request.url).searchParams.get("id") || DEFAULT_SERVER_ID

  const server = getServerById(requestedServerId)

  if (!server) {
    return errorResponse("Unknown server ID.", 404)
  }

  if (!server.enabled) {
    return errorResponse("This server is currently disabled.", 503)
  }

  try {
    const response = await fetch(server.url, {
      signal: AbortSignal.timeout(PLAYLIST_FETCH_TIMEOUT_MS),
      next: {
        revalidate: PLAYLIST_REVALIDATE_SECONDS,
        tags: [`playlist:${server.id}`],
      },
    })

    if (!response.ok) {
      throw new Error(`${server.name} returned HTTP ${response.status}`)
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0)

    if (contentLength > MAX_PLAYLIST_BYTES) {
      throw new Error(`${server.name} returned a playlist that is too large`)
    }

    const playlist = await response.text()

    if (playlist.length > MAX_PLAYLIST_BYTES) {
      throw new Error(`${server.name} returned a playlist that is too large`)
    }

    if (!playlist.includes("#EXTM3U")) {
      throw new Error(`${server.name} returned an invalid M3U playlist`)
    }

    const channels = parsePlaylist(playlist, server)

    return NextResponse.json(channels, {
      headers: {
        "Cache-Control": `public, s-maxage=${PLAYLIST_REVALIDATE_SECONDS}, stale-while-revalidate=${PLAYLIST_STALE_WHILE_REVALIDATE_SECONDS}`,
      },
    })
  } catch (error) {
    console.error(`Failed to load playlist from ${server.name}:`, error)

    return errorResponse(
      `Unable to load channels from ${server.name}. Please try again later.`,
      502
    )
  }
}
