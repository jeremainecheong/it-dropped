"use client"

import { Bell } from "lucide-react"
import { CATEGORIES } from "@/lib/categories"
import { useCategoryWatches } from "@/lib/use-category-watches"

/**
 * "Watch whole categories" — the six bucket chips from lib/categories.ts,
 * each toggling an all-regions category watch. Lives on /wishlist so Saved is
 * the one place watching happens, whether the unit is a garment or a bucket.
 *
 * `available` is false both signed-out and before migration 025 lands; either
 * way nothing these chips could do would stick, so the section disappears
 * entirely rather than dangling controls that no-op.
 */
export function CategoryWatchPanel() {
  const { watches, available, loading, toggle } = useCategoryWatches()

  if (!available) return null

  // The chips speak the all-regions watch (region null) only — the same pair
  // toggle() creates and deletes. A region-scoped watch made elsewhere must
  // not light a chip here, or tapping it would add a second, broader watch
  // while looking like it removes one.
  const watched = new Set(
    watches.filter((w) => (w.region ?? null) === null).map((w) => w.category),
  )

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="label">Watch categories</h2>
      </div>
      <p className="text-[13px] text-muted-foreground -mt-2 mb-3">
        Get one digest when new pieces land in a watched category
      </p>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => {
          const on = watched.has(cat.key)
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => toggle(cat.key)}
              disabled={loading}
              aria-pressed={on}
              className={`chip disabled:opacity-50 ${on ? "chip-on" : ""}`}
            >
              <Bell className={`w-3.5 h-3.5 ${on ? "fill-current" : ""}`} />
              {cat.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
