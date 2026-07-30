"use client"

import { useCallback, useEffect, useState } from "react"
import { formatPrice, type FxRates } from "./currency"
import { usePrefs } from "./prefs"

/**
 * Price display that honours the shopper's currency preference.
 *
 * With displayCurrency "SGD", foreign prices are converted through the rates
 * from /api/dropradar/fx and shown as "≈S$187" — the ≈ and the whole-dollar
 * rounding both mark the number as computed, never to be mistaken for a price
 * a store actually quoted. SGD prices, and everything under the "native"
 * preference, render exactly as quoted via formatPrice.
 */

// The fx endpoint returns { rates, live, date } where rates is USD per one
// unit of each currency (rates.USD === 1). Fetched once per session: the
// endpoint itself caches for six hours, and a rate that moved a fraction of a
// percent mid-session is not worth a refetch per component.
let ratesPromise: Promise<FxRates | null> | null = null

function fetchRatesOnce(): Promise<FxRates | null> {
  if (!ratesPromise) {
    ratesPromise = fetch("/api/dropradar/fx")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => (body?.rates ? (body.rates as FxRates) : null))
      .catch(() => null)
  }
  return ratesPromise
}

/**
 * Returns fmt(price, currency) → display string.
 *
 * Until the rates arrive (or if the fetch fails outright) foreign prices
 * render native rather than through a stale table: an honest £ figure beats a
 * quietly wrong S$ one.
 */
export function useDisplayPrice(): (price: number, currency: string) => string {
  const { prefs } = usePrefs()
  const [rates, setRates] = useState<FxRates | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchRatesOnce().then((r) => {
      if (!cancelled && r) setRates(r)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return useCallback(
    (price: number, currency: string) => {
      if (prefs.displayCurrency !== "SGD" || currency === "SGD") {
        return formatPrice(price, currency)
      }
      const usdPerUnit = rates?.[currency]
      const usdPerSGD = rates?.["SGD"]
      if (!usdPerUnit || !usdPerSGD) return formatPrice(price, currency)
      const sgd = (price * usdPerUnit) / usdPerSGD
      return `≈S$${Math.round(sgd).toLocaleString()}`
    },
    [prefs.displayCurrency, rates],
  )
}

/**
 * A store's own price, in its own currency — for contexts outside React
 * (sorting labels, notification copy) or where conversion would mislead,
 * such as next to a checkout link that will charge the native amount.
 */
export function formatNative(price: number, currency: string): string {
  return formatPrice(price, currency)
}
