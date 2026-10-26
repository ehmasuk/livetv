"use client"

import { useTheme } from "next-themes"
import { useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Moon, Sun } from "lucide-react"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  const toggle = useCallback(() => {
    const isDark =
      resolvedTheme === "dark" ||
      (typeof document !== "undefined" &&
        document.documentElement.classList.contains("dark"))
    setTheme(isDark ? "light" : "dark")
  }, [resolvedTheme, setTheme])

  return (
    <Button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      variant="ghost"
      size="icon"
      className="rounded-xl p-2 bg-card border border-border text-muted-foreground hover:text-foreground hover:border-slate-400 dark:hover:border-slate-600 transition-colors flex items-center justify-center shadow-sm hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]"
    >
      <Sun className="hidden dark:block w-4 h-4" aria-hidden="true" />
      <Moon className="block dark:hidden w-4 h-4" aria-hidden="true" />
    </Button>
  )
}
