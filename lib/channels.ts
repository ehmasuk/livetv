import type { Channel } from "@/lib/types"

const HTTP_URL_PATTERN = /^https?:\/\//i

function isChannel(value: unknown): value is Channel {
  if (typeof value !== "object" || value === null) return false

  const channel = value as Partial<Channel>

  return (
    typeof channel.id === "string" &&
    typeof channel.name === "string" &&
    typeof channel.logo === "string" &&
    typeof channel.group === "string" &&
    typeof channel.url === "string"
  )
}

/**
 * Drops malformed entries and duplicate stream URLs.
 * Keeping this pure makes the API response safe to render without extra checks.
 */
export function normalizeChannels(values: readonly unknown[]): Channel[] {
  const seenUrls = new Set<string>()
  const channels: Channel[] = []

  for (const value of values) {
    if (!isChannel(value)) continue

    const url = value.url.trim()

    if (!HTTP_URL_PATTERN.test(url) || seenUrls.has(url)) continue

    seenUrls.add(url)
    channels.push({ ...value, url })
  }

  return channels
}

export function matchesSearch(channel: Channel, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) return true

  return (
    channel.name.toLowerCase().includes(normalizedQuery) ||
    channel.group.toLowerCase().includes(normalizedQuery)
  )
}
