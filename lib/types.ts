export type Channel = {
  id: string
  name: string
  logo: string
  group: string
  url: string
}

export type ChannelStatus = "working" | "failed" | "testing"

export type ServerCategory = "all" | "sports"

export type ServerConfig = {
  id: string
  name: string
  description: string
  category: ServerCategory
  enabled: boolean
  url: string
}

/**
 * Server data that is safe to send to the browser.
 * Upstream playlist URLs stay on the server.
 */
export type ServerOption = Pick<ServerConfig, "id" | "name" | "description">

export type ApiErrorResponse = {
  error: string
}
