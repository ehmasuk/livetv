
import { NextRequest, NextResponse } from "next/server";
import serversConfig from "@/config/servers.json";

export const runtime = "nodejs";

type Category = "all" | "sports";

type ServerConfig = {
  id: string;
  name: string;
  enabled: boolean;
  category: Category;
  url: string;
};

type Channel = {
  id: string;
  name: string;
  logo: string;
  group: string;
  url: string;
};

const servers = serversConfig as ServerConfig[];

const SPORT_KEYWORDS =
  /\b(sport|sports|cricket|football|soccer|tennis|basketball|baseball|rugby|hockey|golf|motorsport|formula\s?1|f1|boxing|ufc|mma|wrestling|badminton|volleyball|athletics|olympics|nba|nfl|mlb|nhl|wwe|espn|bein sports|sky sports|star sports|sony sports|ten sports|tnt sports|willow|fox sports|supersport|eurosport|sports18|tsn|sportsnet)\b/i;

function getAttribute(
  line: string,
  attribute: string
): string {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const match = line.match(
    new RegExp(`(?:^|\\s)${escaped}="([^"]*)"`, "i")
  );

  return match?.[1] ?? "";
}

function parsePlaylist(
  playlist: string,
  server: ServerConfig
): Channel[] {
  const channels: Channel[] = [];
  const seenUrls = new Set<string>();

  let metadata = "";

  for (const rawLine of playlist.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      metadata = line;
      continue;
    }

    if (line.startsWith("#") || !/^https?:\/\//i.test(line)) {
      continue;
    }

    const currentMetadata = metadata;
    metadata = "";

    if (!currentMetadata) continue;

    const comma = currentMetadata.indexOf(",");

    const name =
      comma >= 0
        ? currentMetadata.slice(comma + 1).trim()
        : "";

    if (!name) continue;

    const logo = getAttribute(currentMetadata, "tvg-logo");
    const group =
      getAttribute(currentMetadata, "group-title") ||
      "Uncategorized";

    // Apply keyword filtering only when a mixed playlist
    // is explicitly configured as sports.
    if (
      server.category === "sports" &&
      !SPORT_KEYWORDS.test(`${name} ${group}`)
    ) {
      continue;
    }

    // Remove duplicate URLs within this server.
    if (seenUrls.has(line)) continue;
    seenUrls.add(line);

    channels.push({
      id: `${server.id}-${channels.length}`,
      name,
      logo,
      group,
      url: line,
    });
  }

  return channels;
}

export async function GET(request: NextRequest) {
const requestedServer =
  request.nextUrl.searchParams.get("id") ||
  "iptv-org-sports";

  const server = servers.find(
    (item) => item.id === requestedServer
  );

  if (!server) {
    return NextResponse.json(
      { error: "Unknown server ID." },
      { status: 404 }
    );
  }

  if (!server.enabled) {
    return NextResponse.json(
      { error: "This server is currently disabled." },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(server.url, {
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(
        `${server.name} returned HTTP ${response.status}`
      );
    }

    const playlist = await response.text();

    if (!playlist.includes("#EXTM3U")) {
      throw new Error(
        `${server.name} returned an invalid M3U playlist`
      );
    }

    const channels = parsePlaylist(playlist, server);

    return NextResponse.json(channels, {
      headers: {
        "Cache-Control":
          "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error(
      `Failed to load playlist from ${server.name}:`,
      error
    );

    return NextResponse.json(
      {
        error: `Unable to load channels from ${server.name}. Please try again later.`,
      },
      { status: 502 }
    );
  }
}
