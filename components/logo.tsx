"use client"

import { cn } from "@/lib/utils"
import { Tv } from "lucide-react"
import Link from "next/link"

type LogoProps = {
  className?: string
}

export function Logo({ className }: LogoProps) {
  return (
    <Link
      href="/"
      aria-label="LiveTVFree - Stream Network"
      className={cn("group flex items-center gap-3 select-none", className)}
    >
      <div className="flex items-center gap-1">
        <div className="text-lg leading-none font-black tracking-wider text-foreground">
          LIVE
        </div>

        <div className="relative flex size-7 items-center justify-center rounded-xl bg-linear-to-br from-red-500 to-red-700 text-white shadow-lg shadow-red-500/25 transition-all duration-300">
          <Tv className="size-4 text-white" />
          <span className="absolute top-px -right-0.5 size-2 rounded-full border-2 border-background bg-emerald-500" />
        </div>
        <div className="text-lg leading-none font-black tracking-wider text-foreground">
          Free
        </div>
      </div>
    </Link>
  )
}
