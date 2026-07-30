"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

/**
 * How long this garment lasted, per region.
 *
 * The one thing here that no storefront will tell you: a piece that went in
 * four hours in Japan and has sat for six days in the US is the same piece,
 * and knowing which is which is most of the decision about whether to hurry.
 *
 * Renders nothing at all until there is something honest to render — see
 * migration 019. Every `new` drop currently on file comes from a catalogue
 * seeding run rather than a release, so a figure derived from it would measure
 * when we started scraping rather than when anything dropped. It fills in as
 * the daily scrape observes real drop days.
 */

interface Row {
  region: string
  product_id: string
  appeared_at: string
  sold_out_at: string | null
  hours: number
  still_live: boolean
}

/** "4h", "2d 6h", "9d" — a duration someone can feel rather than parse. */
function humanise(hours: number): string {
  if (hours < 1) return "<1h"
  if (hours < 48) return `${Math.round(hours)}h`
  const days = Math.floor(hours / 24)
  const rem = Math.round(hours % 24)
  return rem > 0 && days < 7 ? `${days}d ${rem}h` : `${days}d`
}

export function SelloutVelocity({ styleCode }: { styleCode?: string }) {
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    if (!styleCode) return
    let cancelled = false

    supabase.rpc("sellout_by_style", { p_style_code: styleCode }).then(({ data, error }) => {
      // A missing function, an empty result and a failed request all mean the
      // same thing to a reader: nothing to say. Never a placeholder number.
      if (cancelled || error || !Array.isArray(data)) return
      setRows(data as Row[])
    })

    return () => {
      cancelled = true
    }
  }, [styleCode])

  if (rows.length === 0) return null

  const soldOut = rows.filter((r) => r.sold_out_at !== null)
  const fastest = soldOut.length ? soldOut.reduce((a, b) => (a.hours <= b.hours ? a : b)) : null

  return (
    <div className="py-8 border-t border-border">
      <h2 className="label mb-2">How fast it went</h2>
      <p className="text-xs text-muted-foreground mb-6">
        Measured from the first time we saw this listing appear to the first time we saw it sell
        out.
        {fastest && (
          <> Fastest was {fastest.region.toUpperCase()}, in {humanise(fastest.hours)}.</>
        )}
      </p>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.product_id} className="flex items-center gap-3 text-[13px]">
            <span className="w-8 text-[11px] font-semibold uppercase tracking-wide">
              {r.region.toUpperCase()}
            </span>
            {/* Bar length is relative to the slowest row, so the comparison is
                between regions rather than against an arbitrary ceiling. */}
            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${r.sold_out_at ? "bg-signal" : "bg-muted-foreground/40"}`}
                style={{
                  width: `${Math.max(4, Math.min(100, (r.hours / Math.max(...rows.map((x) => x.hours))) * 100))}%`,
                }}
              />
            </div>
            <span className={r.sold_out_at ? "font-medium" : "text-muted-foreground"}>
              {humanise(r.hours)}
            </span>
            <span className="text-[11px] text-muted-foreground w-20 text-right">
              {r.sold_out_at ? "sold out" : r.still_live ? "still up" : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
