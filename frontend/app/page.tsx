"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Heart, PackageX, TrendingDown } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { ImageWithLoading } from "@/components/image-with-loading"
import { useAuth } from "@/lib/auth-context"
import { asProductId, useWishlist } from "@/lib/wishlist-context"
import { supabase } from "@/lib/supabase"
import { formatNative, useDisplayPrice } from "@/lib/display-price"
import { cleanTitle } from "@/lib/title"

interface LatestProduct {
  id: string
  title: string
  price: number
  currency: string
  image_url: string
  region: string
}

interface PriceCut {
  id: string
  product_id: string | null
  title: string
  price: number
  currency: string
  old_value: string
  region: string
  product_url: string
  detected_at: string
}

interface CurrentPrice {
  price: number
  currency: string
  isAvailable: boolean
}

/**
 * Next Friday 18:00 in Singapore. Stussy's weekly release has landed then for
 * every drop the tracker has witnessed, but it is an observed pattern, not a
 * schedule the stores publish — the copy under the countdown says so.
 *
 * SGT is UTC+8 with no DST, so Friday 18:00 SGT is always Friday 10:00 UTC and
 * the maths can stay in UTC instead of fighting timezone APIs.
 */
function nextExpectedDrop(nowMs: number): Date {
  const target = new Date(nowMs)
  target.setUTCHours(10, 0, 0, 0)
  let daysAhead = (5 - target.getUTCDay() + 7) % 7
  if (daysAhead === 0 && target.getTime() <= nowMs) daysAhead = 7
  target.setUTCDate(target.getUTCDate() + daysAhead)
  return target
}

function countdownLabel(nowMs: number): string {
  const diff = Math.max(0, Math.floor((nextExpectedDrop(nowMs).getTime() - nowMs) / 1000))
  const d = Math.floor(diff / 86400)
  const h = Math.floor((diff % 86400) / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/**
 * What the saved listings cost *now* — the bulk pattern from /wishlist: one
 * .in() read of products for the whole saved set. products is publicly
 * SELECT-able (migration 013), so the browser client reads it directly.
 */
function useCurrentPrices(productIds: string[]) {
  const [prices, setPrices] = useState<Record<string, CurrentPrice>>({})

  // Keyed on the joined ids so the effect re-runs when the saved set changes
  // and not when the array is merely a new object of the same ids.
  const key = productIds.join(",")

  useEffect(() => {
    // Legacy saves resolve their id from the TEXT handle column, so an id here
    // is not guaranteed to be a product UUID. products.id is UUID: one bad
    // value in the filter is a 400 for the whole request.
    const ids = productIds.filter((id) => asProductId(id) !== null)
    if (!ids.length) return
    let cancelled = false

    supabase
      .from("products")
      .select("id, price, currency, is_available")
      .in("id", ids)
      .then(({ data, error }) => {
        // No current price is a real answer: the item simply doesn't show as a
        // mover rather than showing a delta we cannot stand behind.
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
 * Placeholders until the real numbers load. Every figure shown here comes from
 * the tracker's own database — a dash is more honest than a made-up figure.
 */
const STATS_FALLBACK = [
  { value: "—", label: "Products tracked" },
  { value: "—", label: "Changes witnessed" },
  { value: "6", label: "Regions" },
]

export default function TodayPage() {
  const { user, isLoading: authLoading } = useAuth()
  const { items } = useWishlist()
  const fmt = useDisplayPrice()

  // null until mounted: the server can't know the client's clock, and any
  // real time here would be a hydration mismatch.
  const [nowMs, setNowMs] = useState<number | null>(null)
  const [lastScrapeAt, setLastScrapeAt] = useState<string | null>(null)
  const [latest, setLatest] = useState<LatestProduct[]>([])
  const [latestLoading, setLatestLoading] = useState(true)
  const [cuts, setCuts] = useState<PriceCut[]>([])
  const [cutsLoading, setCutsLoading] = useState(true)
  const [stats, setStats] = useState(STATS_FALLBACK)

  const currentPrices = useCurrentPrices(useMemo(() => items.map((i) => i.id), [items]))

  // Live countdown tick; also keeps the "checked Xm ago" line current.
  useEffect(() => {
    setNowMs(Date.now())
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async (url: string) => fetch(url).then((r) => r.json())

    load("/api/dropradar/status")
      .then((json) => {
        if (!cancelled && json?.success && json.data?.last_scrape_at) {
          setLastScrapeAt(json.data.last_scrape_at)
        }
      })
      .catch(() => {})

    load("/api/dropradar/products?limit=8&sort=newest&available=true")
      .then((json) => {
        if (!cancelled && json?.success && Array.isArray(json.data)) setLatest(json.data)
      })
      .catch(() => {})
      .finally(() => !cancelled && setLatestLoading(false))

    load("/api/dropradar/drops?type=price_drop&limit=6")
      .then((json) => {
        if (!cancelled && json?.success && Array.isArray(json.data)) setCuts(json.data)
      })
      .catch(() => {})
      .finally(() => !cancelled && setCutsLoading(false))

    // Real numbers from the same API the rest of the app reads. If either
    // request fails the placeholders stay.
    Promise.all([
      load("/api/dropradar/stats"),
      load("/api/dropradar/drops?limit=1"),
    ])
      .then(([statsRes, dropsRes]) => {
        if (cancelled) return
        const regions: any[] = Array.isArray(statsRes?.data) ? statsRes.data : []
        const tracked = regions.reduce((acc, r) => acc + (r.total_tracked_items || 0), 0)
        const witnessed = dropsRes?.meta?.total
        setStats([
          { value: tracked ? tracked.toLocaleString() : "—", label: "Products tracked" },
          { value: typeof witnessed === "number" ? witnessed.toLocaleString() : "—", label: "Changes witnessed" },
          { value: String(regions.length || 6), label: "Regions" },
        ])
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  // A saved item earns a row only if something actually changed: the price
  // moved past rounding tolerance (prices are decimals off the wire), or the
  // listing sold out. Saves without a live products row stay silent.
  const movers = useMemo(
    () =>
      items
        .map((item) => {
          const current = currentPrices[item.id]
          if (!current) return null
          const delta = current.price - item.price
          const priceMoved = Math.abs(delta) > 0.01
          if (!priceMoved && current.isAvailable) return null
          return { item, current, delta, priceMoved }
        })
        .filter((m): m is NonNullable<typeof m> => m !== null),
    [items, currentPrices],
  )

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      <main id="main" className="flex-1 pt-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          {/* The page's single black anchor: the countdown IS the product,
              so it gets the panel and the editorial type. */}
          <section className="pt-6">
            <div className="panel-dark px-5 sm:px-8 pt-6 pb-7">
              <p className="label flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse-soft" aria-hidden />
                Next expected drop
              </p>
              {/* .num, not proportional figures — this re-renders every second
                  and anything else wobbles. */}
              <p className="page-title num mt-3" suppressHydrationWarning>
                {nowMs === null ? "— — —" : countdownLabel(nowMs)}
              </p>
              {/* The instant is fixed (Friday 10:00 UTC); the clock it is read
                  on is the visitor's. */}
              <p className="text-[13px] text-primary-foreground/60 mt-4" suppressHydrationWarning>
                {nowMs === null
                  ? "Fridays 18:00 Singapore time — typical, measured — not promised."
                  : `${nextExpectedDrop(nowMs).toLocaleString(undefined, {
                      weekday: "long",
                      hour: "numeric",
                      minute: "2-digit",
                    })} your time (18:00 SGT) — typical, measured — not promised.`}
              </p>
              <p className="text-[13px] text-primary-foreground/60 mt-0.5">
                {lastScrapeAt ? `Catalogue checked ${timeAgo(lastScrapeAt)}` : "Catalogue freshness unknown"}
              </p>
            </div>
          </section>

          {/* Latest drops */}
          <section className="section">
            <div className="section-head">
              <h2 className="label">Latest drops</h2>
              <Link href="/drops" className="btn btn-ghost btn-sm -mr-3.5">
                All drops <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {latestLoading ? (
              <div className="flex gap-4 overflow-hidden">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="w-40 sm:w-44 shrink-0">
                    <div className="aspect-[3/4] rounded-2xl image-loading" />
                  </div>
                ))}
              </div>
            ) : latest.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Nothing live right now —{" "}
                <Link href="/drops" className="underline underline-offset-2 hover:text-foreground">
                  see the full feed
                </Link>
                .
              </p>
            ) : (
              <div className="flex gap-4 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:-mx-6 sm:px-6 pb-1">
                {latest.map((p, i) => (
                  <Link
                    key={p.id}
                    href={`/product/${p.id}`}
                    className="group w-40 sm:w-44 shrink-0 animate-rise"
                    // "both" so a delayed card holds the from-state instead of
                    // flashing in before its turn.
                    style={{ animationDelay: `${Math.min(i * 50, 300)}ms`, animationFillMode: "both" }}
                  >
                    <div className="card-lift card-frame relative aspect-[3/4]">
                      <ImageWithLoading
                        src={p.image_url}
                        alt={p.title}
                        className="w-full h-full object-cover product-image-zoom"
                      />
                      <span className="pill absolute top-2.5 left-2.5 bg-background/90 backdrop-blur px-2 py-0.5 text-[10px] font-medium uppercase">
                        {p.region}
                      </span>
                    </div>
                    <h3 className="text-[13px] font-medium truncate mt-2.5 px-0.5">{cleanTitle(p.title).name}</h3>
                    <p className="num text-[13px] text-muted-foreground px-0.5">{fmt(p.price, p.currency)}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Saved movers (signed in) / slim sign-in banner (signed out) */}
          {user ? (
            <section className="section">
              <div className="section-head">
                <h2 className="label">Your saved items</h2>
                <Link href="/wishlist" className="btn btn-ghost btn-sm -mr-3.5">
                  View saved <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {movers.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  {items.length === 0 ? "Nothing saved yet — " : "No movement among your saved items — "}
                  <Link href="/wishlist" className="underline underline-offset-2 hover:text-foreground">
                    {items.length === 0 ? "start on your wishlist" : "see them all"}
                  </Link>
                  .
                </p>
              ) : (
                <div className="space-y-2">
                  {movers.map(({ item, current, delta, priceMoved }) => {
                    const href = asProductId(item.id) ? `/product/${item.id}` : null
                    const inner = (
                      <>
                        <div className="w-12 h-14 rounded-lg overflow-hidden bg-secondary/50 shrink-0">
                          <ImageWithLoading
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[13px] font-medium truncate">{item.name}</h3>
                          <p className="num text-[12px] text-muted-foreground">
                            {priceMoved ? (
                              <>
                                <span className="line-through">{formatNative(item.price, item.currency)}</span>{" "}
                                <span className={delta < 0 ? "text-signal font-medium" : undefined}>
                                  {formatNative(current.price, current.currency)}
                                </span>
                              </>
                            ) : (
                              formatNative(current.price, current.currency)
                            )}
                            <span className="uppercase"> · {item.region}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {priceMoved && (
                            <span
                              className={`pill num inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold ${
                                delta < 0 ? "bg-signal text-signal-foreground" : "bg-secondary text-muted-foreground"
                              }`}
                            >
                              <TrendingDown className={`w-3 h-3 ${delta > 0 ? "rotate-180" : ""}`} />
                              {delta < 0 ? "−" : "+"}
                              {formatNative(Math.abs(delta), current.currency)}
                            </span>
                          )}
                          {!current.isAvailable && (
                            <span className="pill inline-flex items-center gap-1 bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              <PackageX className="w-3 h-3" />
                              Sold out
                            </span>
                          )}
                        </div>
                      </>
                    )
                    const rowClass = "card-lift card-frame flex items-center gap-4 p-3 pr-4"
                    return href ? (
                      <Link key={item.id} href={href} className={rowClass}>
                        {inner}
                      </Link>
                    ) : (
                      <div key={item.id} className={rowClass}>
                        {inner}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          ) : authLoading ? null : (
            <section className="section">
              <div className="section-head">
                <h2 className="label">What this is</h2>
                <Link href="/login" className="btn btn-primary btn-sm shrink-0">
                  Sign in
                </Link>
              </div>
              {/* Three short truths beat a marketing hero — every claim below
                  is a live feature, not aspiration. Framed like everything
                  else on the page, not floating grey blobs. */}
              <div className="grid sm:grid-cols-3 gap-2">
                {[
                  ["Six storefronts, one catalogue", "US, UK, EU, Japan, Australia and Singapore, checked daily."],
                  ["Prices you can compare", "Landed cost to your country — shipping, tax and duty included."],
                  ["Alerts before it's gone", "Restocks, price cuts and new drops in your size."],
                ].map(([head, body]) => (
                  <div key={head} className="card-frame px-4 py-3.5">
                    <p className="text-[13px] font-semibold">{head}</p>
                    <p className="text-xs text-muted-foreground mt-1">{body}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Price cuts */}
          <section className="section">
            <div className="section-head">
              <h2 className="label">Price cuts</h2>
              <Link href="/drops?type=price_drop" className="btn btn-ghost btn-sm -mr-3.5">
                All cuts <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {cutsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 rounded-2xl bg-secondary p-3">
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 rounded image-loading" />
                      <div className="h-3 w-1/5 rounded image-loading" />
                    </div>
                  </div>
                ))}
              </div>
            ) : cuts.length === 0 ? (
              // A quiet feed is a true statement — this only holds cuts a
              // scrape actually witnessed.
              <p className="text-[13px] text-muted-foreground">No price cuts witnessed recently.</p>
            ) : (
              <div className="space-y-2">
                {cuts.map((cut) => {
                  const oldPrice = parseFloat(cut.old_value)
                  const inner = (
                    <>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[13px] font-medium truncate">{cleanTitle(cut.title).name}</h3>
                        <p className="num text-[12px] text-muted-foreground">
                          {Number.isFinite(oldPrice) && (
                            <>
                              <span className="line-through">{formatNative(oldPrice, cut.currency)}</span>{" "}
                              <ArrowRight className="inline w-3 h-3 align-[-1px]" />{" "}
                            </>
                          )}
                          <span className="text-signal font-medium">{formatNative(cut.price, cut.currency)}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] uppercase text-muted-foreground">{cut.region}</p>
                        <p className="text-[11px] text-muted-foreground">{timeAgo(cut.detected_at)}</p>
                      </div>
                    </>
                  )
                  const rowClass = "card-lift card-frame flex items-center gap-4 p-3 pr-4"
                  return cut.product_id ? (
                    <Link key={cut.id} href={`/product/${cut.product_id}`} className={rowClass}>
                      {inner}
                    </Link>
                  ) : (
                    <a key={cut.id} href={cut.product_url} target="_blank" rel="noopener noreferrer" className={rowClass}>
                      {inner}
                    </a>
                  )
                })}
              </div>
            )}
          </section>

          {/* Stats: a ruled ledger row, not floating numerals. */}
          <section className="section mb-16">
            <div className="section-head">
              <h2 className="label">The tracker</h2>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border card-frame">
              {stats.map((stat) => (
                <div key={stat.label} className="px-4 py-5 text-center">
                  <p className="display num text-3xl sm:text-4xl">{stat.value}</p>
                  <p className="text-[11px] sm:text-[13px] text-muted-foreground mt-1.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
