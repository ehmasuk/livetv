import Link from "next/link"

export function SiteHeader() {
  return (
    <header className="border-b border-white/10 bg-[#101014]">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-5">
        <Link href="/" className="text-2xl font-black tracking-tight">
          <span className="text-red-500">SPORTS</span> TV
        </Link>

        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">
          FREE SPORTS STREAMS
        </span>
      </div>
    </header>
  )
}
