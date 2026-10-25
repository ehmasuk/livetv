"use client"

import { useEffect, useState } from "react"
import { normalizeChannels } from "@/lib/channels"
import type { ApiErrorResponse, Channel } from "@/lib/types"

type ChannelsState = {
  channels: Channel[]
  loading: boolean
  error: string | null
}

const INITIAL_STATE: ChannelsState = {
  channels: [],
  loading: true,
  error: null,
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== "object" || value === null) return false

  return (
    "error" in value && typeof (value as ApiErrorResponse).error === "string"
  )
}

async function getResponseError(response: Response) {
  try {
    const body: unknown = await response.json()

    if (isApiErrorResponse(body)) {
      return body.error
    }
  } catch {
    // Fall through to a status-based message when the body is not JSON.
  }

  return `Could not load channels (HTTP ${response.status}).`
}

/**
 * Loads and normalizes the channel list for one server.
 *
 * The dashboard is mounted with a `key` per server, so changing servers
 * remounts this hook and resets the loading state naturally.
 */
export function useChannels(serverId: string): ChannelsState {
  const [state, setState] = useState<ChannelsState>(INITIAL_STATE)

  useEffect(() => {
    const controller = new AbortController()

    async function loadChannels() {
      try {
        const response = await fetch(
          `/api/channels?id=${encodeURIComponent(serverId)}`,
          { signal: controller.signal }
        )

        if (!response.ok) {
          throw new Error(await getResponseError(response))
        }

        const data: unknown = await response.json()

        if (!Array.isArray(data)) {
          throw new Error("The server returned an invalid channel list.")
        }

        if (controller.signal.aborted) return

        setState({
          channels: normalizeChannels(data),
          loading: false,
          error: null,
        })
      } catch (error) {
        if (controller.signal.aborted) return

        console.error("Channel loading failed:", error)

        setState({
          channels: [],
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not load channels. Please refresh and try again.",
        })
      }
    }

    void loadChannels()

    return () => controller.abort()
  }, [serverId])

  return state
}
