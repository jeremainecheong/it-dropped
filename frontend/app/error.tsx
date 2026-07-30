"use client"

import { useEffect } from "react"
import Link from "next/link"
import { LogoMark } from "@/components/ui/logo"

/**
 * What a user sees when a route throws.
 *
 * Before this existed, every uncaught error in the app produced Next's built-in
 * fallback: a bare white page reading "Application error: a client-side
 * exception has occurred". No header, no navigation, no way back — and no
 * indication of whether the fault was theirs, the network's or ours.
 *
 * The concrete case it exists for is `getProduct` in `lib/api.ts`, which now
 * throws on a query error instead of returning null. Every product route
 * therefore has a live path to an uncaught error whenever Supabase is
 * unreachable, and "Try again" is the correct response to that — a retry of a
 * transient outage is the one repair a visitor can actually perform.
 *
 * It is a backstop, not a diagnosis: it cannot say which of the app's reads
 * failed, only that the route did.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The digest is the only handle on a production stack trace, which is
    // minified and stripped by the time it reaches a browser.
    console.error("Route error:", error.digest ?? "(no digest)", error)
  }, [error])

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-5 px-6 text-center">
      <LogoMark className="w-6 h-6" />
      <div className="space-y-2">
        <p className="text-[15px] font-semibold">Something broke on this page</p>
        <p className="text-[13px] text-muted-foreground max-w-sm">
          Not your fault. Trying again often works — the catalogue is read live and a
          request can simply fail.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={reset}
          className="pill px-5 py-2.5 bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-85 transition-opacity"
        >
          Try again
        </button>
        <Link
          href="/shop"
          className="pill px-5 py-2.5 bg-secondary text-foreground text-[13px] font-medium hover:opacity-85 transition-opacity"
        >
          Back to shop
        </Link>
      </div>

      {/* Shown rather than hidden: without it there is no way to correlate a
          report with a log line. */}
      {error.digest && (
        <p className="text-[11px] text-muted-foreground/60 font-mono">{error.digest}</p>
      )}
    </div>
  )
}
