"use client"

import { Search, X } from "lucide-react"
import { useCallback } from "react"
import { Button } from "@/components/ui/button"

type ChannelSearchProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: "text" | "search"
  id?: string
  className?: string
  containerClassName?: string
}

/** Reusable channel search input with a clear button. Used on both desktop and mobile. */
export function ChannelSearch({
  value,
  onChange,
  placeholder = "Search channels...",
  type = "text",
  id,
  className,
  containerClassName,
}: ChannelSearchProps) {
  const clear = useCallback(() => onChange(""), [onChange])

  return (
    <div className={containerClassName}>
      <div className="relative">
        <Search
          className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <input
          type={type}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
          className={className}
          aria-label="Search channels"
        />
        {value && (
          <Button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            variant="ghost"
            size="icon-sm"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition p-1"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
