"use client"

import { useEffect, useState } from "react"
import { supabase } from "./supabase"

export interface PriceStats {
  low: number
  high: number
  /** How many price changes we have recorded in the window. */
  points: number
}

/**
 * What a listing has actually cost, over `days`.
 *
 * The point of this is to replace a claim we cannot check with one we can. The
 * SALE badge reads `compare_price`, which the retailer sets to whatever they
 * like — "was £120, now £60" on a garment that never sold at £120 is standard
 * practice. `price_history` is our own record of what each listing has been
 * priced at since January, so "the lowest in 90 days" is either true of that
 * record or it is not.
 */
export function usePriceStats(productId: string | null | undefined, days = 90) {
  const [stats, setStats] = useState<PriceStats | null>(null)

  useEffect(() => {
    if (!productId) return
    let cancelled = false

    supabase
      .rpc("price_stats", { p_product_id: productId, p_days: days })
      .then(({ data, error }) => {
        // Absent function, absent history and a failed request are all the same
        // outcome here: no verifiable claim, so no badge. Never a fabricated one.
        if (cancelled || error || !data?.length) return
        const row = data[0] as { low: number | null; high: number | null; points: number }
        if (row.low == null || row.high == null) return
        setStats({ low: Number(row.low), high: Number(row.high), points: row.points })
      })

    return () => {
      cancelled = true
    }
  }, [productId, days])

  return stats
}

/**
 * The same, for a page of listings in one round trip.
 *
 * A grid of 24 cards asking individually is 24 requests for a badge, which is
 * a good way to make browsing slower than the information is worth.
 */
export function usePriceStatsBulk(productIds: string[], days = 90) {
  const [stats, setStats] = useState<Record<string, PriceStats>>({})

  // Keyed on the joined ids so the effect re-runs when the page of results
  // changes, and does not when the array is merely a new object of the same ids.
  const key = productIds.join(",")

  useEffect(() => {
    if (!productIds.length) return
    let cancelled = false

    supabase
      .rpc("price_stats_bulk", { p_product_ids: productIds, p_days: days })
      .then(({ data, error }) => {
        if (cancelled || error || !Array.isArray(data)) return
        const next: Record<string, PriceStats> = {}
        for (const row of data as Array<{ product_id: string; low: number; high: number; points: number }>) {
          if (row.low == null || row.high == null) continue
          next[row.product_id] = { low: Number(row.low), high: Number(row.high), points: row.points }
        }
        setStats(next)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, days])

  return stats
}

export interface PriceVerdict {
  /** Short label for a badge, or null when nothing is worth claiming. */
  label: string | null
  /** True for a genuine low — worth the accent colour. */
  isLow: boolean
}

/**
 * Turn stats into something sayable, or say nothing.
 *
 * Three guards, each there to stop the badge becoming as meaningless as the one
 * it replaces.
 *
 * A single recorded price is not a series: a listing we have only ever seen at
 * one price cannot be at "its lowest".
 *
 * Nor can one whose price has never moved. Two observations of ¥33,000 make
 * ¥33,000 both the low and the high, and "Lowest in 90 days" on that is true
 * in the way a tautology is true — it reads as a discount and describes a
 * price that has never changed. Real examples of exactly this were sitting in
 * the data when this was written.
 *
 * And a drop of a percent or two is currency rounding rather than a sale.
 */
export function priceVerdict(price: number, stats: PriceStats | null): PriceVerdict {
  if (!stats || stats.points < 2) return { label: null, isLow: false }
  if (stats.high <= stats.low) return { label: null, isLow: false }

  // Prices are decimals off the wire; compare with a cent of tolerance rather
  // than by equality.
  if (price <= stats.low + 0.01) return { label: "Lowest in 90 days", isLow: true }

  const offHigh = stats.high > 0 ? 1 - price / stats.high : 0
  if (offHigh >= 0.05) return { label: `${Math.round(offHigh * 100)}% off its high`, isLow: false }

  return { label: null, isLow: false }
}
