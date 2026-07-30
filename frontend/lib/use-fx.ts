"use client"

import { useEffect, useState } from "react"
import { FALLBACK_FX_TO_USD, type FxRates } from "./currency"

interface Fx {
  rates: FxRates
  /** False while the fallback table is in use — either still loading, or the
   *  feed is down. Surfaced so the UI can say the figures are indicative. */
  live: boolean
  /** The date the rates were published, when known. */
  date: string | null
}

/**
 * Current exchange rates, from /api/dropradar/fx.
 *
 * Starts on the fallback table and swaps to live rates when they arrive, so
 * the first paint has numbers rather than a spinner over a price comparison.
 * Rates are returned rather than written to module state: a component has to
 * re-render to show them, and it only does that if they flow through props or
 * state.
 */
export function useFx(): Fx {
  const [fx, setFx] = useState<Fx>({ rates: FALLBACK_FX_TO_USD, live: false, date: null })

  useEffect(() => {
    let cancelled = false

    fetch("/api/dropradar/fx")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body?.rates) return
        setFx({ rates: body.rates, live: Boolean(body.live), date: body.date ?? null })
      })
      // Silent: the fallback is already rendered and is good enough to rank
      // listings with. There is nothing for a shopper to do about a rates feed.
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  return fx
}
