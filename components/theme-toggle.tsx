"use client"

import { useTheme } from "next-themes"
import { useCallback } from "react"
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
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground hover:border-slate-400 dark:hover:border-slate-600 transition flex items-center justify-center shadow-sm"
    >
      <Sun className="hidden dark:block w-4 h-4" aria-hidden="true" />
      <Moon className="block dark:hidden w-4 h-4" aria-hidden="true" />
    </button>
  )
}


