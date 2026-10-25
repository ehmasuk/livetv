"use client"

import Link from "next/link"
import { Tv } from "lucide-react"
import { cn } from "@/lib/utils"

type LogoProps = {
  className?: string
}

export function Logo({ className }: LogoProps) {
  return (
    <Link
      href="/"
      aria-label="LiveTVFree - Stream Network"
      className={cn("flex items-center gap-3 group select-none", className)}
    >
      <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-red-700 text-white shadow-lg shadow-red-500/25 group-hover:scale-105 transition-all duration-300">
        <Tv className="w-5 h-5 text-white" />
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-background" />
      </div>
      <div className="flex flex-col">
        <span className="text-lg font-black tracking-wider text-foreground leading-none">
          LIVE<span className="text-red-500">TV</span>
          <span className="text-muted-foreground font-medium text-xs ml-0.5">FREE</span>
        </span>
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold mt-0.5">
          Stream Network
        </span>
      </div>
    </Link>
  )
}

