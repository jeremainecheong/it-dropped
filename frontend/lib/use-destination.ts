"use client"

import { useCallback, useEffect, useState } from "react"
import { DEFAULT_DESTINATION, getDestination, type Destination } from "./landed-cost"

const STORAGE_KEY = "itdropped:destination"

/**
 * The country the shopper is buying into. Landed-cost estimates are
 * meaningless without it, so it persists across visits.
 *
 * Starts at the default on the server and on first paint, then upgrades from
 * localStorage after mount — keeping SSR output deterministic.
 */
export function useDestination(): {
  destination: Destination
  setDestination: (code: string) => void
  isReady: boolean
} {
  const [code, setCode] = useState(DEFAULT_DESTINATION)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) setCode(stored)
    } catch {
      // private mode / storage disabled — the default is fine
    }
    setIsReady(true)
  }, [])

  const setDestination = useCallback((next: string) => {
    setCode(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // non-fatal
    }
  }, [])

  return { destination: getDestination(code), setDestination, isReady }
}
