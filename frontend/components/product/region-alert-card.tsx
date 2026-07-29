"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Globe, Check, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"

interface RegionAlertCardProps {
  /** Cross-region garment identity. Falls back to the handle upstream. */
  styleCode: string
  /** Region code the user buys from, e.g. "sg". */
  region: string
  /** Human-readable destination name, e.g. "Singapore". */
  regionName: string
  title: string
  imageUrl?: string
  /** Regions that already stock it, for the explanatory line. */
  stockedIn: string[]
}

/**
 * Shown when a garment is listed in other regions but not the shopper's own.
 *
 * This is the one alert that cannot point at a products row: the listing the
 * user wants does not exist yet. It is keyed on (style_code, region) instead
 * and matched by the scraper when a "new" drop appears in that region.
 */
export function RegionAlertCard({
  styleCode,
  region,
  regionName,
  title,
  imageUrl,
  stockedIn,
}: RegionAlertCardProps) {
  const { user } = useAuth()
  const [state, setState] = useState<"idle" | "saving" | "watching">("idle")
  const [error, setError] = useState("")

  // Reflect an alert set on an earlier visit, so the button doesn't invite
  // the user to subscribe to something they already watch.
  useEffect(() => {
    if (!user || !styleCode) return
    let cancelled = false

    supabase
      .from("region_alerts")
      .select("id")
      .eq("user_id", user.id)
      .eq("style_code", styleCode)
      .eq("region", region)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setState("watching")
      })

    return () => {
      cancelled = true
    }
  }, [user, styleCode, region])

  const handleWatch = async () => {
    if (!user) return
    setState("saving")
    setError("")

    const { error: dbError } = await supabase.from("region_alerts").upsert(
      {
        user_id: user.id,
        style_code: styleCode,
        region,
        title,
        image_url: imageUrl ?? null,
        is_active: true,
        triggered: false,
      },
      { onConflict: "user_id,style_code,region" }
    )

    if (dbError) {
      setError(dbError.message)
      setState("idle")
      return
    }
    setState("watching")
  }

  const others = stockedIn.map((r) => r.toUpperCase()).join(", ")

  return (
    <div className="rounded-2xl bg-secondary p-5">
      <div className="flex items-start gap-3">
        <Globe className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold mb-1">Not stocked in {regionName}</h3>
          <p className="text-xs text-muted-foreground mb-4">
            {others ? `Currently listed in ${others}.` : "Not listed in your region."} You can
            import it, or wait for a local release.
          </p>

          {!user ? (
            <Link
              href="/login"
              className="pill inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold"
            >
              Sign in to get notified
            </Link>
          ) : state === "watching" ? (
            <p className="inline-flex items-center gap-2 text-xs font-semibold text-green-600">
              <Check className="w-3.5 h-3.5" />
              We&apos;ll tell you when it lands in {regionName}
            </p>
          ) : (
            <button
              onClick={handleWatch}
              disabled={state === "saving"}
              className="pill inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold disabled:opacity-60"
            >
              {state === "saving" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Globe className="w-3.5 h-3.5" />
              )}
              Notify me when it drops in {regionName}
            </button>
          )}

          {error && <p className="mt-2 text-xs text-signal">{error}</p>}
        </div>
      </div>
    </div>
  )
}
