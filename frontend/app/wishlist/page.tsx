"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Heart, ArrowLeft, Trash2, ExternalLink } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { asProductId, useWishlist } from "@/lib/wishlist-context"
import { supabase } from "@/lib/supabase"
import { toUSD } from "@/lib/currency"
import { useDisplayPrice } from "@/lib/display-price"
import { ImageWithLoading } from "@/components/image-with-loading"
import { Header } from "@/components/layout/header"
import { CategoryWatchPanel } from "@/components/watches/category-watch-panel"

interface CurrentPrice {
  price: number
  currency: string
  isAvailable: boolean
}

/**
 * What the saved listings cost *now*.
 *
 * The wishlist rendered wishlists.price, which is whatever the listing cost on
 * the day it was saved and is never written again — so a tracker that exists to
 * tell you a price moved was showing the one number guaranteed not to move.
 *
 * One request for the whole page, after the bulk pattern in use-price-stats.ts:
 * a saved page of twenty is twenty round trips otherwise. products is publicly
 * SELECT-able (migration 013), so the browser client can read it directly.
 */
function useCurrentPrices(productIds: string[]) {
  const [prices, setPrices] = useState<Record<string, CurrentPrice>>({})

  // Keyed on the joined ids so the effect re-runs when the saved set changes
  // and not when the array is merely a new object of the same ids.
  const key = productIds.join(",")

  useEffect(() => {
    // Saves written before product_id was populated resolve their id from the
    // TEXT handle column, so an id here is not guaranteed to be a product UUID.
    // products.id is UUID: one bad value in the filter is a 400 for the whole
    // request, which would blank the prices for every other card too.
    const ids = productIds.filter((id) => asProductId(id) !== null)
    if (!ids.length) return
    let cancelled = false

    supabase
      .from("products")
      .select("id, price, currency, is_available")
      .in("id", ids)
      .then(({ data, error }) => {
        // No current price is a real answer: the card falls back to showing the
        // saved price alone rather than a delta we cannot stand behind.
        if (cancelled || error || !Array.isArray(data)) return
        const next: Record<string, CurrentPrice> = {}
        for (const row of data as Array<{ id: string; price: number | string | null; currency: string; is_available: boolean }>) {
          if (row.price == null) continue
          next[row.id] = {
            price: Number(row.price),
            currency: row.currency,
            isAvailable: row.is_available,
          }
        }
        setPrices(next)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return prices
}

type AlertType = "price_drop" | "any_change" | "restock"

interface SavedAlert {
  alert_type: AlertType
  triggered: boolean
}

// Same vocabulary as price-alert-modal.tsx, lowercased to sit inside a chip.
const ALERT_LABELS: Record<AlertType, string> = {
  price_drop: "price drop",
  restock: "restock",
  any_change: "any change",
}

/**
 * The signed-in user's active alerts across the saved set, keyed by product
 * id. One bulk read, same shape as useCurrentPrices above — a page of twenty
 * saves must not be twenty alert lookups.
 *
 * The chips these feed are a hint, not the alert system: a failed read leaves
 * the map empty and the cards render without chips, nothing worse.
 */
function useSavedAlerts(userId: string | undefined, productIds: string[]) {
  const [alerts, setAlerts] = useState<Record<string, SavedAlert[]>>({})

  const key = productIds.join(",")

  useEffect(() => {
    // price_alerts.product_id is UUID; legacy handle-keyed saves can't have
    // alerts and would 400 the whole filter (same trap as useCurrentPrices).
    const ids = productIds.filter((id) => asProductId(id) !== null)
    if (!userId || !ids.length) {
      setAlerts({})
      return
    }
    let cancelled = false

    supabase
      .from("price_alerts")
      .select("product_id, alert_type, is_active, triggered")
      .eq("user_id", userId)
      .in("product_id", ids)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !Array.isArray(data)) {
          if (error) console.error("Error loading alert chips:", error)
          return
        }
        const next: Record<string, SavedAlert[]> = {}
        for (const row of data as Array<{ product_id: string; alert_type: AlertType; is_active: boolean; triggered: boolean }>) {
          // A paused alert isn't watching anything; "(fired)" on an active one
          // is, though — the matcher won't look at it again until it's re-set.
          if (!row.is_active) continue
          ;(next[row.product_id] ??= []).push({
            alert_type: row.alert_type,
            triggered: Boolean(row.triggered),
          })
        }
        setAlerts(next)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key])

  return alerts
}

/**
 * The card's main target, which is not always a link.
 *
 * Three cases: a product UUID opens our own page, a legacy handle-keyed save
 * opens the store instead, and a legacy save with an internal `url` has nowhere
 * valid to go — that one renders as plain markup rather than a link to a route
 * that would throw.
 */
function CardLink({
  href,
  external,
  className,
  children,
}: {
  href: string | null
  external: boolean
  className: string
  children: ReactNode
}) {
  if (!href) return <div className={className}>{children}</div>
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}

export default function WishlistPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const { items, removeItem } = useWishlist()
  const [isPageLoaded, setIsPageLoaded] = useState(false)
  const [sortMode, setSortMode] = useState<"recent" | "movers">("recent")
  const productIds = useMemo(() => items.map((i) => i.id), [items])
  const currentPrices = useCurrentPrices(productIds)
  const alerts = useSavedAlerts(user?.id, productIds)
  const fmt = useDisplayPrice()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login")
    }
    setIsPageLoaded(true)
  }, [user, authLoading, router])

  // "Recent" is the context's own order (created_at desc). "Movers" ranks by
  // how far each price has travelled since the save — through USD, because a
  // raw |¥3000| would bury every $20 move on the page (see lib/currency.ts).
  // No current price means no known movement, which sorts last, not wrongly.
  const sortedItems = useMemo(() => {
    if (sortMode === "recent") return items
    return items
      .map((item) => {
        const current = currentPrices[item.id]
        const delta = current ? current.price - item.price : 0
        return { item, moved: Math.abs(toUSD(delta, current?.currency || item.currency)) }
      })
      .sort((a, b) => b.moved - a.moved)
      .map((entry) => entry.item)
  }, [items, sortMode, currentPrices])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-[13px] text-muted-foreground animate-pulse">Loading…</div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main id="main" className="pt-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 pb-nav">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="page-title">Saved</h1>
              <p className="num text-[13px] text-muted-foreground mt-2">{items.length} {items.length === 1 ? "item" : "items"}</p>
            </div>
            {/* Display utilities live in the utilities layer and lose to the
                unlayered .btn rules, so the responsive hide sits on a wrapper. */}
            <span className="hidden sm:block">
              <Link href="/shop" className="btn btn-ghost btn-sm -mr-3.5">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to shop
              </Link>
            </span>
          </div>
          <hr className="hairline-signal mt-4" />

          <CategoryWatchPanel />

          <section className="section">
            <div className="section-head">
              <h2 className="label">Your items</h2>
              {items.length > 0 && (
                <div className="flex items-center gap-1.5" role="group" aria-label="Sort saved items">
                  {([
                    ["recent", "Recent"],
                    ["movers", "Movers"],
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setSortMode(mode)}
                      aria-pressed={sortMode === mode}
                      className={`chip ${sortMode === mode ? "chip-on" : ""}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

          {items.length === 0 ? (
            <div
              className={`min-h-[55vh] flex flex-col items-center justify-center text-center transition-opacity duration-300 ${isPageLoaded ? "opacity-100" : "opacity-0"
                }`}
            >
              <Heart className="w-9 h-9 text-muted-foreground mb-4" strokeWidth={1.5} />
              <h2 className="text-[15px] font-semibold mb-1.5">Your saved items</h2>
              <p className="text-[13px] text-muted-foreground mb-6 max-w-xs">
                Items you save will appear here. Start browsing to find something you like.
              </p>
              <Link href="/shop" className="btn btn-primary">
                Shop now
              </Link>
            </div>
          ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-8">
              {sortedItems.map((item, index) => {
                const current = currentPrices[item.id]
                const cardAlerts = alerts[item.id] ?? []
                // Prices are decimals off the wire; a cent of tolerance so
                // rounding is not reported as a price change.
                const delta = current ? current.price - item.price : 0
                const changed = Math.abs(delta) > 0.01
                // trending-products saves url as an internal /product/<id>
                // path, so not every saved row carries a store link.
                const storeUrl = /^https?:\/\//i.test(item.url) ? item.url : null
                // /product/[id] queries products.id, a UUID column: a handle in
                // that slot is a PostgREST 22P02, which getProduct throws on and
                // error.tsx catches — a save from before product_id was
                // populated would open "Something went wrong" instead of the
                // listing. Those rows keep the store link as their only target.
                const productHref = asProductId(item.id) ? `/product/${item.id}` : storeUrl
                // An external target needs the new-tab treatment; an internal
                // one must not have it.
                const external = productHref !== null && productHref === storeUrl
                return (
                  <div
                    key={item.id}
                    className={`group transition-opacity duration-300 ${isPageLoaded ? "opacity-100" : "opacity-0"}`}
                    style={{ transitionDelay: `${Math.min(index * 20, 200)}ms` }}
                  >
                    <div className="card-lift card-frame relative aspect-[3/4] mb-3">
                      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
                        {storeUrl && (
                          <a
                            href={storeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Open on the Stüssy store"
                            className="pill w-8 h-8 flex items-center justify-center bg-background/90 backdrop-blur text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-foreground transition-all"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => removeItem(item.id)}
                          aria-label="Remove from wishlist"
                          className="pill w-8 h-8 flex items-center justify-center bg-background/90 backdrop-blur text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-foreground transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {current && !current.isAvailable && (
                        // pointer-events-none because a sold-out save is
                        // precisely the one worth opening — the product page is
                        // where the other regions are.
                        <div className="absolute inset-0 z-[5] pointer-events-none bg-background/60 backdrop-blur-[2px] flex items-center justify-center">
                          <span className="pill bg-background px-3 py-1.5 text-xs font-medium">Sold out</span>
                        </div>
                      )}

                      {/* The saved item is a product we have a page for; the
                          store is the secondary action above. Every link here
                          used to leave the app entirely. */}
                      <CardLink href={productHref} external={external} className="block w-full h-full">
                        <ImageWithLoading
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover product-image-zoom"
                        />
                      </CardLink>
                    </div>

                    <CardLink href={productHref} external={external} className="block px-1">
                      <h3 className="text-[13px] font-medium leading-snug mb-0.5 line-clamp-1">
                        {item.name}
                      </h3>
                      <div className="flex items-center justify-between text-[13px]">
                        <span className={`num ${changed && delta < 0 ? "text-signal font-medium" : "text-muted-foreground"}`}>
                          {fmt(current ? current.price : item.price, current?.currency || item.currency)}
                        </span>
                        <span className="text-muted-foreground uppercase text-[11px]">{item.region}</span>
                      </div>
                      {changed && (
                        <p className="num text-[11px] mt-0.5 text-muted-foreground">
                          <span className="line-through">{fmt(item.price, item.currency)}</span>{" "}
                          <span className={delta < 0 ? "text-signal" : undefined}>
                            {delta < 0 ? "↓" : "↑"} {fmt(Math.abs(delta), current?.currency || item.currency)}
                          </span>{" "}
                          since you saved it
                        </p>
                      )}
                    </CardLink>

                    {/* Outside CardLink — nesting this <Link> inside it would
                        be an anchor in an anchor. */}
                    {cardAlerts.length > 0 && (
                      <Link
                        href="/profile/alerts"
                        className="flex flex-wrap items-center gap-1 px-1 mt-1.5 group/alerts"
                      >
                        <span className="text-[10px] text-muted-foreground">watching:</span>
                        {cardAlerts.map((alert) => (
                          <span
                            key={alert.alert_type}
                            className="pill bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground group-hover/alerts:text-foreground transition-colors"
                          >
                            {ALERT_LABELS[alert.alert_type]}
                            {alert.triggered ? " (fired)" : ""}
                          </span>
                        ))}
                      </Link>
                    )}
                  </div>
                )
              })}
              </div>
          )}
          </section>
        </div>
      </main>
    </div>
  )
}
