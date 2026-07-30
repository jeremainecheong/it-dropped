"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "./supabase"
import { useAuth } from "./auth-context"

/**
 * Row shape of category_watches (migration 025). One row per watched bucket:
 * category is a key from lib/categories.ts, region narrows the watch to one
 * storefront (null = all six), my_sizes_only intersects new arrivals with the
 * shopper's saved sizes. Unique on (user_id, category, COALESCE(region,'all')).
 */
export interface CategoryWatch {
  id: string
  user_id: string
  category: string
  region: string | null
  my_sizes_only: boolean
  is_active: boolean
  created_at: string
}

export interface ToggleOpts {
  /** Restrict the watch to one storefront; omitted means all regions. */
  region?: string | null
  /** Defaults true — a watch that pings on sizes you can't wear is noise. */
  mySizesOnly?: boolean
}

// The frontend can deploy ahead of migration 025. Until the table exists,
// PostgREST answers 42P01 (undefined_table) or, when the schema cache is the
// one that's behind, PGRST205 with "Could not find the table". Either way the
// feature simply isn't there yet.
function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === "42P01" || error.code === "PGRST205") return true
  return /relation .* does not exist|could not find the table/i.test(error.message ?? "")
}

/**
 * The signed-in user's category watches.
 *
 * `available` is false when the table doesn't exist yet (or nobody is signed
 * in); every mutator is then a no-op, and the UI should hide watch controls
 * entirely rather than offer a button that silently does nothing.
 *
 * Mutations are optimistic — a watch toggle should feel like a switch, and
 * for a single-user tool the write conflicts that optimism risks don't exist.
 */
export function useCategoryWatches(): {
  watches: CategoryWatch[]
  available: boolean
  loading: boolean
  toggle: (category: string, opts?: ToggleOpts) => Promise<void>
  setActive: (id: string, active: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
} {
  const { user } = useAuth()
  const [watches, setWatches] = useState<CategoryWatch[]>([])
  const [tableExists, setTableExists] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setWatches([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    supabase
      .from("category_watches")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          if (isMissingRelation(error)) setTableExists(false)
          setWatches([])
        } else {
          setWatches((data as CategoryWatch[]) ?? [])
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const available = tableExists && user !== null

  /** Create the watch for (category, region), or delete it if it exists. */
  const toggle = useCallback(
    async (category: string, opts?: ToggleOpts) => {
      if (!available || !user) return
      const region = opts?.region ?? null
      const existing = watches.find(
        (w) => w.category === category && (w.region ?? null) === region,
      )
      if (existing) {
        setWatches((ws) => ws.filter((w) => w.id !== existing.id))
        await supabase.from("category_watches").delete().eq("id", existing.id)
        return
      }
      const { data, error } = await supabase
        .from("category_watches")
        .insert({
          user_id: user.id,
          category,
          region,
          // False until the matcher actually honours it — defaulting true
          // would promise size filtering this release does not perform.
          my_sizes_only: opts?.mySizesOnly ?? false,
          is_active: true,
        })
        .select()
        .single()
      if (error) {
        if (isMissingRelation(error)) setTableExists(false)
        return
      }
      if (data) setWatches((ws) => [...ws, data as CategoryWatch])
    },
    [available, user, watches],
  )

  /** Pause or resume a watch without losing its region/size settings. */
  const setActive = useCallback(
    async (id: string, active: boolean) => {
      if (!available) return
      setWatches((ws) => ws.map((w) => (w.id === id ? { ...w, is_active: active } : w)))
      await supabase.from("category_watches").update({ is_active: active }).eq("id", id)
    },
    [available],
  )

  const remove = useCallback(
    async (id: string) => {
      if (!available) return
      setWatches((ws) => ws.filter((w) => w.id !== id))
      await supabase.from("category_watches").delete().eq("id", id)
    },
    [available],
  )

  return { watches, available, loading, toggle, setActive, remove }
}
