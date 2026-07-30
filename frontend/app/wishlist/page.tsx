"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Heart, ArrowLeft, Trash2, ExternalLink } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { asProductId, useWishlist } from "@/lib/wishlist-context"
import { supabase } from "@/lib/supabase"
import { ImageWithLoading } from "@/components/image-with-loading"
import { Header } from "@/components/layout/header"

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
  const currentPrices = useCurrentPrices(useMemo(() => items.map((i) => i.id), [items]))

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login")
    }
    setIsPageLoaded(true)
  }, [user, authLoading, router])

  const formatPrice = (price: number, currency: string) => {
    const symbols: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", JPY: "¥", AUD: "A$", SGD: "S$" }
    return `${symbols[currency] || currency}${price.toFixed(currency === "JPY" ? 0 : 2)}`
  }

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

      <main className="pt-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 pb-nav">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h1 className="display text-2xl md:text-3xl">Saved</h1>
              <p className="text-[13px] text-muted-foreground mt-1">{items.length} {items.length === 1 ? "item" : "items"}</p>
            </div>
            <Link href="/shop" className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to shop
            </Link>
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
              <Link
                href="/shop"
                className="pill px-6 py-2.5 bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-85"
              >
                Shop now
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-8">
              {items.map((item, index) => {
                const current = currentPrices[item.id]
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
                    <div className="relative aspect-[3/4] bg-secondary rounded-2xl mb-3 overflow-hidden">
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
                        <span className={changed && delta < 0 ? "text-signal font-medium" : "text-muted-foreground"}>
                          {formatPrice(current ? current.price : item.price, current?.currency || item.currency)}
                        </span>
                        <span className="text-muted-foreground uppercase text-[11px]">{item.region}</span>
                      </div>
                      {changed && (
                        <p className="text-[11px] mt-0.5 text-muted-foreground">
                          <span className="line-through">{formatPrice(item.price, item.currency)}</span>{" "}
                          <span className={delta < 0 ? "text-signal" : undefined}>
                            {delta < 0 ? "↓" : "↑"} {formatPrice(Math.abs(delta), current?.currency || item.currency)}
                          </span>{" "}
                          since you saved it
                        </p>
                      )}
                    </CardLink>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
