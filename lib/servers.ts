import serversConfig from "@/config/servers.json"
import type { ServerConfig, ServerOption } from "@/lib/types"

const servers = serversConfig as ServerConfig[]

function assertValidServers(config: ServerConfig[]) {
  if (config.length === 0) {
    throw new Error("config/servers.json must contain at least one server.")
  }

  const ids = new Set<string>()

  for (const server of config) {
    if (!server.id || !server.name || !server.description) {
      throw new Error(
        `Every server in config/servers.json needs an id, name, and description.`
      )
    }

    if (ids.has(server.id)) {
      throw new Error(
        `Duplicate server id in config/servers.json: ${server.id}`
      )
    }

    if (server.category !== "all" && server.category !== "sports") {
      throw new Error(
        `Server "${server.id}" has an invalid category. Use "all" or "sports".`
      )
    }

    let url: URL

    try {
      url = new URL(server.url)
    } catch {
      throw new Error(`Server "${server.id}" has an invalid URL.`)
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`Server "${server.id}" must use an http or https URL.`)
    }

    ids.add(server.id)
  }

  if (!config.some((server) => server.enabled)) {
    throw new Error(
      "config/servers.json must contain at least one enabled server."
    )
  }
}

assertValidServers(servers)

/** The server marked `default: true` in config, else the first enabled server. */
export const DEFAULT_SERVER_ID =
  servers.find((server) => server.enabled && server.default === true)?.id ??
  servers.find((server) => server.enabled)?.id ??
  ""

export function getServerById(id: string | null | undefined) {
  if (!id) return undefined

  return servers.find((server) => server.id === id)
}

/** Returns only the metadata the browser needs. */
export function getServerOptions(): ServerOption[] {
  return servers
    .filter((server) => server.enabled)
    .map(({ id, name, description }) => ({ id, name, description }))
}
