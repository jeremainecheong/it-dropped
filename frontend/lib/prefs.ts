"use client"

import { useCallback, useEffect, useState } from "react"
import { DESTINATIONS } from "./landed-cost"
import { FALLBACK_FX_TO_USD } from "./currency"

/**
 * The shopper's standing preferences, persisted in localStorage.
 *
 * One person uses this app, so preferences are a local matter — no profile
 * table, no sync. `sizes` holds normalised tokens ("M", "32", "OS"), the
 * cross-region vocabulary, never per-store spellings: they are matched against
 * available_sizes_normalised, and a stored "MEDIUM" would match nothing.
 */
export interface Prefs {
  sizes: string[]
  /** "native" shows each store's own price; a currency code converts everything. */
  displayCurrency: "native" | string
  /** Destination country code for landed-cost estimates. */
  destination: string
}

/**
 * SSR-deterministic defaults. Deliberately NOT anyone's real locale: the
 * server cannot know the visitor, so the first paint shows native prices and
 * no destination bias, and inferLocalePrefs() upgrades on the client for
 * first-time visitors only. (This app began life hardcoded to Singapore —
 * every visitor was quoted S$ and a SG landed cost, which for the five other
 * storefronts' buyers was a stranger's wallet.)
 */
export const DEFAULT_PREFS: Prefs = {
  sizes: [],
  displayCurrency: "native",
  destination: "SG",
}

/** Currencies conversion can actually honour. */
const KNOWN_CURRENCIES = new Set(Object.keys(FALLBACK_FX_TO_USD))
const KNOWN_DESTINATIONS = new Set(DESTINATIONS.map((d) => d.code))

/**
 * First-visit defaults from the visitor's own clock. The IANA timezone is the
 * most honest locale signal a browser offers without asking — no permission
 * prompt, no IP lookup — and it maps cleanly onto the fifteen destinations the
 * landed-cost table serves.
 */
const TZ_EXACT: Record<string, string> = {
  "Asia/Singapore": "SG",
  "Asia/Hong_Kong": "HK",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Kuching": "MY",
  "Asia/Bangkok": "TH",
  "Asia/Manila": "PH",
  "Asia/Jakarta": "ID",
  "Asia/Makassar": "ID",
  "Asia/Jayapura": "ID",
  "Asia/Tokyo": "JP",
  "Asia/Kolkata": "IN",
  "Europe/London": "GB",
  "Africa/Johannesburg": "ZA",
  "America/Mexico_City": "MX",
  "America/Sao_Paulo": "BR",
}

function destinationFromTimezone(tz: string): string | null {
  if (TZ_EXACT[tz]) return TZ_EXACT[tz]
  if (tz.startsWith("Australia/")) return "AU"
  if (tz.startsWith("Europe/")) return "EU"
  // The Americas outside the mapped cities: the US store is the plausible
  // storefront; Canadian visitors get US defaults, which is at least the
  // right continent and the right currency ballpark to reason from.
  if (tz.startsWith("America/") || tz.startsWith("US/") || tz.startsWith("Canada/")) return "US"
  return null
}

export function inferLocalePrefs(): Partial<Prefs> {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const dest = tz ? destinationFromTimezone(tz) : null
    if (!dest) return {}
    const currency = DESTINATIONS.find((d) => d.code === dest)?.currency
    return {
      destination: dest,
      ...(currency && KNOWN_CURRENCIES.has(currency) ? { displayCurrency: currency } : {}),
    }
  } catch {
    return {}
  }
}

const STORAGE_KEY = "itdropped:prefs"

// The `storage` event only fires in *other* tabs, so writes also dispatch
// this event locally to keep every usePrefs() in the writing tab current.
const PREFS_EVENT = "itdropped:prefs"

/** Coerce whatever was stored into a valid Prefs, dropping junk fields. */
function sanitise(raw: unknown): Prefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFS }
  const p = raw as Partial<Prefs>
  return {
    sizes: Array.isArray(p.sizes)
      ? p.sizes.filter((s): s is string => typeof s === "string")
      : [],
    displayCurrency:
      p.displayCurrency === "native"
        ? "native"
        : typeof p.displayCurrency === "string" && KNOWN_CURRENCIES.has(p.displayCurrency)
          ? p.displayCurrency
          : DEFAULT_PREFS.displayCurrency,
    destination:
      typeof p.destination === "string" && KNOWN_DESTINATIONS.has(p.destination)
        ? p.destination
        : DEFAULT_PREFS.destination,
  }
}

/**
 * Current preferences. Safe to call anywhere: on the server (and before
 * hydration) it returns the defaults, which is what usePrefs renders first —
 * SSR output stays deterministic.
 */
export function getPrefs(): Prefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored) return sanitise(JSON.parse(stored))
    // First visit: seed from the visitor's locale and persist, so the values
    // are stable and visible in Preferences rather than re-inferred forever.
    const seeded = sanitise({ ...DEFAULT_PREFS, ...inferLocalePrefs() })
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
    } catch {
      // private mode: inference still applies for this pageview
    }
    return seeded
  } catch {
    // private mode / corrupt JSON — the defaults are fine
    return { ...DEFAULT_PREFS }
  }
}

/** Merge a partial update into stored preferences and notify listeners. */
export function setPrefs(partial: Partial<Prefs>): Prefs {
  const next = sanitise({ ...getPrefs(), ...partial })
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // non-fatal: the event still updates this tab for the session
    }
    window.dispatchEvent(new Event(PREFS_EVENT))
  }
  return next
}

/**
 * Preferences as React state. Re-renders on writes from this tab (via the
 * custom event) and from other tabs (via the storage event).
 *
 * Starts at the defaults and upgrades from localStorage after mount, so the
 * server and first client paint agree. `isReady` flips once the stored values
 * are in — gate anything that would flash the wrong currency on it.
 */
export function usePrefs(): {
  prefs: Prefs
  setPrefs: (partial: Partial<Prefs>) => void
  isReady: boolean
} {
  const [prefs, setState] = useState<Prefs>(DEFAULT_PREFS)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    setState(getPrefs())
    setIsReady(true)

    const sync = () => setState(getPrefs())
    const onStorage = (e: StorageEvent) => {
      // key === null means the whole store was cleared
      if (e.key === null || e.key === STORAGE_KEY) sync()
    }
    window.addEventListener(PREFS_EVENT, sync)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(PREFS_EVENT, sync)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  const update = useCallback((partial: Partial<Prefs>) => {
    setPrefs(partial)
  }, [])

  return { prefs, setPrefs: update, isReady }
}
