import type { Channel, ServerConfig } from "@/lib/types"

const SPORT_KEYWORDS =
  /\b(sport|sports|cricket|football|soccer|tennis|basketball|baseball|rugby|hockey|golf|motorsport|formula\s?1|f1|boxing|ufc|mma|wrestling|badminton|volleyball|athletics|olympics|nba|nfl|mlb|nhl|wwe|espn|bein sports|sky sports|star sports|sony sports|ten sports|tnt sports|willow|fox sports|supersport|eurosport|sports18|tsn|sportsnet)\b/i

const ATTRIBUTE_PATTERN = /([\w-]+)="([^"]*)"/g

type PlaylistServer = Pick<ServerConfig, "id" | "category">

function parseAttributes(line: string) {
  const attributes: Record<string, string> = {}

  for (const match of line.matchAll(ATTRIBUTE_PATTERN)) {
    attributes[match[1].toLowerCase()] = match[2]
  }

  return attributes
}

/**
 * EXTINF lines end with a comma before the channel name. Attribute values are
 * quoted, so a plain `indexOf(",")` breaks when a value contains a comma.
 */
function findTitleSeparator(line: string) {
  let insideQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]

    if (character === '"') {
      insideQuotes = !insideQuotes
    } else if (character === "," && !insideQuotes) {
      return index
    }
  }

  return -1
}

export function parsePlaylist(
  playlist: string,
  server: PlaylistServer
): Channel[] {
  const channels: Channel[] = []
  const seenUrls = new Set<string>()

  let metadata = ""
  let pendingGroup = ""

  for (const rawLine of playlist.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line) continue

    if (line.startsWith("#EXTINF:")) {
      metadata = line
      continue
    }

    if (line.startsWith("#EXTGRP:")) {
      pendingGroup = line.slice("#EXTGRP:".length).trim()
      continue
    }

    if (line.startsWith("#") || !/^https?:\/\//i.test(line)) {
      continue
    }

    const currentMetadata = metadata
    metadata = ""

    if (!currentMetadata) continue

    const titleSeparator = findTitleSeparator(currentMetadata)
    const info =
      titleSeparator >= 0
        ? currentMetadata.slice(0, titleSeparator)
        : currentMetadata
    const attributes = parseAttributes(info)

    const name =
      (titleSeparator >= 0
        ? currentMetadata.slice(titleSeparator + 1).trim()
        : "") || attributes["tvg-name"]?.trim()

    const logo = attributes["tvg-logo"] ?? ""
    const group =
      attributes["group-title"]?.trim() || pendingGroup || "Uncategorized"

    // EXTGRP applies to the next entry only.
    pendingGroup = ""

    if (!name) continue

    // Mixed playlists can be marked as "sports" so only sports channels pass.
    if (
      server.category === "sports" &&
      !SPORT_KEYWORDS.test(`${name} ${group}`)
    ) {
      continue
    }

    if (seenUrls.has(line)) continue

    seenUrls.add(line)
    channels.push({
      id: `${server.id}-${channels.length}`,
      name,
      logo,
      group,
      url: line,
    })
  }

  return channels
}
