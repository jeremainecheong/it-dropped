"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Sun, Moon } from "lucide-react"

export function ThemeToggle() {
    const { theme, setTheme, resolvedTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return (
            <button className="w-9 h-9 flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-900">
                <span className="sr-only">Toggle theme</span>
            </button>
        )
    }

    const isDark = resolvedTheme === "dark"

    return (
        <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="w-9 h-9 flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 transition-colors"
            aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        >
            {isDark ? (
                <Sun className="w-4 h-4 text-neutral-300" />
            ) : (
                <Moon className="w-4 h-4 text-neutral-300" />
            )}
        </button>
    )
}
