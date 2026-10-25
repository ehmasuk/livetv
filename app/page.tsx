import { HomePage } from "@/components/home/home-page"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { getServerOptions } from "@/lib/servers"

export default function Page() {
  const servers = getServerOptions()

  return (
    <main className="min-h-screen bg-[#09090b] text-white">
      <SiteHeader />

      {servers.length > 0 ? (
        <HomePage servers={servers} />
      ) : (
        <div className="mx-auto max-w-3xl p-6 text-sm text-zinc-400">
          No enabled servers are configured. Add one to{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
            config/servers.json
          </code>
          .
        </div>
      )}

      <SiteFooter />
    </main>
  )
}
