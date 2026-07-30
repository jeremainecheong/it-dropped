"use client"

import { useCallback, useEffect, useState } from "react"

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
  /** "native" shows each store's own price; "SGD" converts everything. */
  displayCurrency: "native" | "SGD"
  /** Destination country code for landed-cost estimates. */
  destination: string
}

export const DEFAULT_PREFS: Prefs = {
  sizes: [],
  displayCurrency: "SGD",
  destination: "SG",
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
    displayCurrency: p.displayCurrency === "native" ? "native" : "SGD",
    destination:
      typeof p.destination === "string" && p.destination
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
    return stored ? sanitise(JSON.parse(stored)) : { ...DEFAULT_PREFS }
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
