"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Heart, PackageX, TrendingDown } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { LogoMark } from "@/components/ui/logo"
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
  available_sizes_normalised?: string[]
  available_sizes?: string[]
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

  // Which of the newest pieces the cover is showing. The cover rotates rather
  // than pinning the single newest listing: one flat studio shot would
  // otherwise be the whole first impression for a week, and a lookbook turns
  // its page.
  const [coverIdx, setCoverIdx] = useState(0)

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

  // The ticker's contents: every figure live, none decorative. This is where
  // the old stats row went — a number that scrolls past is read; a number in a
  // grid at the bottom of the page is not.
  const tickerItems = useMemo(() => {
    const out: string[] = []
    if (nowMs !== null) out.push(`Next drop in ${countdownLabel(nowMs)}`)
    const tracked = stats[0]?.value
    if (tracked && tracked !== "—") out.push(`${tracked} styles tracked`)
    out.push("6 storefronts")
    const witnessed = stats[1]?.value
    if (witnessed && witnessed !== "—") out.push(`${witnessed} changes witnessed`)
    if (lastScrapeAt) out.push(`Checked ${timeAgo(lastScrapeAt)}`)
    if (cuts.length > 0) out.push(`${cuts.length} price cuts`)
    return out
  }, [nowMs, stats, lastScrapeAt, cuts.length])

  // The cover rotates through the three newest; the grid below always shows
  // the same six, so a piece never appears in both at once.
  const coverPool = useMemo(() => latest.slice(0, 3), [latest])
  const rest = latest.slice(3, 9)

  useEffect(() => {
    if (coverPool.length < 2) return
    const id = setInterval(() => setCoverIdx((i) => (i + 1) % coverPool.length), 7000)
    return () => clearInterval(id)
  }, [coverPool.length])

  const cover = coverPool[Math.min(coverIdx, Math.max(coverPool.length - 1, 0))]
  const coverSizes = (cover?.available_sizes_normalised?.length
    ? cover.available_sizes_normalised
    : cover?.available_sizes ?? []
  ).slice(0, 8)

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      <main id="main" className="flex-1 pt-12">
        {/* The band of live numbers. Pauses on hover so a figure can actually
            be read, and holds its content twice so the loop has no seam. */}
        <div className="ticker bg-ink text-ink-foreground overflow-hidden py-2.5">
          <div className="marquee-track">
            {[0, 1].map((copy) => (
              <span key={copy} className="flex items-center" aria-hidden={copy === 1}>
                {tickerItems.map((t, i) => (
                  <span key={`${copy}-${i}`} className="flex items-center">
                    <span className="num px-5 text-[11px] font-medium uppercase tracking-[0.14em] whitespace-nowrap">
                      {t}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-signal shrink-0" aria-hidden />
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>

        {/* THE COVER — the newest piece, full bleed. Six storefronts of
            lookbook photography is the best asset this app has; it used to be
            rendered at 160px inside a scroll strip. */}
        {cover ? (
          <Link
            href={`/product/${cover.id}`}
            className="group relative block lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
          >
            {/* The plate. Every piece in the pool is stacked and cross-faded,
                so the rotation never reflows the layout and the next image is
                already decoded when its turn comes. */}
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-secondary sm:aspect-[3/4] lg:aspect-auto lg:min-h-[600px]">
              {coverPool.map((p, i) => (
                <img
                  key={p.id}
                  src={p.image_url}
                  alt=""
                  aria-hidden={i !== coverIdx}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out ${
                    i === coverIdx ? "opacity-100" : "opacity-0"
                  }`}
                />
              ))}
              {/* Mobile lays the type over the image; the desktop split gives
                  it its own black column, so the scrim is only needed here. */}
              <div className="cover-scrim absolute inset-0 lg:hidden" aria-hidden />
            </div>

            <div className="absolute inset-x-0 bottom-0 px-4 pb-8 sm:px-6 sm:pb-10 lg:static lg:flex lg:flex-col lg:justify-end lg:bg-ink lg:px-10 lg:pb-12 lg:pt-12">
              <p className="label flex items-center gap-2 text-white [text-shadow:0_1px_12px_rgb(0_0_0/0.6)] lg:[text-shadow:none]">
                <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse-soft" aria-hidden />
                Just dropped · {cover.region.toUpperCase()}
              </p>
              <h1 className="page-title mt-3 max-w-[14ch] text-white [text-shadow:0_2px_24px_rgb(0_0_0/0.45)] sm:max-w-[18ch] lg:text-[clamp(2.25rem,3.4vw,3.25rem)] lg:[text-shadow:none]">
                {cleanTitle(cover.title).name}
              </h1>

              {/* What is actually gettable, at a glance. The one piece of hard
                  utility a cover can carry without becoming a spec sheet. */}
              {coverSizes.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  {coverSizes.map((sz) => (
                    <span
                      key={sz}
                      className="pill border border-white/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90"
                    >
                      {sz}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                <span className="num display text-2xl text-white sm:text-3xl">
                  {fmt(cover.price, cover.currency)}
                </span>
                <span className="btn bg-white text-black group-hover:opacity-90">
                  See the piece <ArrowRight className="h-4 w-4" />
                </span>
              </div>

              {/* Which of the rotation we are on — and a way to steer it. */}
              {coverPool.length > 1 && (
                <div className="mt-6 flex items-center gap-2">
                  {coverPool.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-label={`Show piece ${i + 1} of ${coverPool.length}`}
                      aria-current={i === coverIdx}
                      onClick={(e) => {
                        // Inside the cover's <Link>; without this the dot
                        // navigates to the product instead of switching.
                        e.preventDefault()
                        e.stopPropagation()
                        setCoverIdx(i)
                      }}
                      className={`h-0.5 w-8 rounded-full transition-colors ${
                        i === coverIdx ? "bg-white" : "bg-white/30 hover:bg-white/60"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </Link>
        ) : (
          // No catalogue to lead with — say so on the same plate rather than
          // collapsing the page's opening statement to nothing.
          <div className="flex h-[52vh] min-h-[340px] flex-col items-center justify-center bg-ink px-6 text-center text-ink-foreground">
            <span aria-hidden className="opacity-20">
              <LogoMark className="h-16 w-16" />
            </span>
            <p className="page-title mt-6">Never miss<br />the drop.</p>
            <p className="mt-4 max-w-sm text-[13px] text-ink-foreground/60">
              {latestLoading
                ? "Reading the storefronts…"
                : "Nothing live in the catalogue right now. The next scrape will fill this."}
            </p>
          </div>
        )}

        {/* THE REST OF THE DROP — an editorial grid, numbered like a
            lookbook. The lead piece runs double width; nothing is 160px. */}
        {rest.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
            <div className="flex items-end justify-between gap-4">
              <h2 className="page-title text-[clamp(2rem,7vw,3.25rem)]">Also live</h2>
              <Link href="/drops" className="btn btn-ghost btn-sm -mr-3.5 shrink-0">
                All drops <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <hr className="hairline-signal mt-4" />

            <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 lg:grid-cols-3">
              {rest.map((p, i) => {
                const { name, colour } = cleanTitle(p.title)
                return (
                  <Link
                    key={p.id}
                    href={`/product/${p.id}`}
                    className={`group animate-rise ${i === 0 ? "col-span-2 lg:col-span-2" : ""}`}
                    style={{ animationDelay: `${Math.min(i * 60, 360)}ms`, animationFillMode: "both" }}
                  >
                    <div
                      className={`relative overflow-hidden bg-secondary ${
                        i === 0 ? "aspect-[16/10]" : "aspect-[3/4]"
                      }`}
                    >
                      <ImageWithLoading
                        src={p.image_url}
                        alt={name}
                        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                      />
                      {/* The index, set into the plate — the lookbook device
                          that makes a grid read as a sequence. */}
                      <span className="num absolute left-3 top-3 text-[11px] font-semibold tracking-widest text-white mix-blend-difference">
                        {String(i + coverPool.length + 1).padStart(2, "0")}
                      </span>
                      <span className="absolute right-3 top-3 text-[10px] font-semibold uppercase tracking-widest text-white mix-blend-difference">
                        {p.region}
                      </span>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between gap-3">
                      <h3 className="text-[13px] font-medium leading-snug line-clamp-2">
                        {name}
                        {colour && <span className="font-normal text-muted-foreground"> · {colour}</span>}
                      </h3>
                      <p className="num shrink-0 text-[13px] text-muted-foreground">
                        {fmt(p.price, p.currency)}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* PRICE CUTS — a poster, not a table. The whole point of the page is
            that a number moved; the number should be the biggest thing in the
            row. */}
        <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <h2 className="page-title text-[clamp(2rem,7vw,3.25rem)]">Price cuts</h2>
            <Link href="/drops?type=price_drop" className="btn btn-ghost btn-sm -mr-3.5 shrink-0">
              All cuts <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <hr className="hairline-signal mt-4" />

          {cutsLoading ? (
            <div className="mt-2 divide-y divide-border">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2 py-5">
                  <div className="image-loading h-4 w-1/2 rounded" />
                  <div className="image-loading h-3 w-1/4 rounded" />
                </div>
              ))}
            </div>
          ) : cuts.length === 0 ? (
            // A quiet feed is a true statement — this only holds cuts a scrape
            // actually witnessed.
            <p className="py-6 text-[13px] text-muted-foreground">No price cuts witnessed recently.</p>
          ) : (
            <div className="mt-2 divide-y divide-border">
              {cuts.map((cut) => {
                const oldPrice = parseFloat(cut.old_value)
                const pct =
                  Number.isFinite(oldPrice) && oldPrice > 0
                    ? Math.round((1 - cut.price / oldPrice) * 100)
                    : null
                const inner = (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="label">
                        {cut.region.toUpperCase()} · {timeAgo(cut.detected_at)}
                      </p>
                      <h3 className="mt-1 truncate text-[15px] font-medium sm:text-lg">
                        {cleanTitle(cut.title).name}
                      </h3>
                    </div>
                    <div className="flex shrink-0 items-baseline gap-3">
                      {Number.isFinite(oldPrice) && (
                        <span className="num text-[13px] text-muted-foreground line-through">
                          {formatNative(oldPrice, cut.currency)}
                        </span>
                      )}
                      <span className="num display text-xl text-signal sm:text-2xl">
                        {formatNative(cut.price, cut.currency)}
                      </span>
                      {pct !== null && pct > 0 && (
                        <span className="num pill bg-signal px-2 py-0.5 text-[10px] font-semibold text-signal-foreground">
                          −{pct}%
                        </span>
                      )}
                    </div>
                  </>
                )
                const rowClass =
                  "flex items-center gap-4 py-5 transition-colors hover:bg-secondary/60 -mx-4 px-4 sm:-mx-6 sm:px-6"
                return cut.product_id ? (
                  <Link key={cut.id} href={`/product/${cut.product_id}`} className={rowClass}>
                    {inner}
                  </Link>
                ) : (
                  <a
                    key={cut.id}
                    href={cut.product_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={rowClass}
                  >
                    {inner}
                  </a>
                )
              })}
            </div>
          )}
        </section>

        {/* THE PERSONAL BAND — what moved among the pieces you saved, or, for
            a visitor, the one thing an account adds. Full bleed black, so the
            page closes on the same weight the ticker opened it with. */}
        <section className="mt-16 bg-ink text-ink-foreground">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            {user ? (
              <>
                <div className="flex items-end justify-between gap-4">
                  <h2 className="page-title text-[clamp(2rem,7vw,3.25rem)]">Your watch</h2>
                  <Link
                    href="/wishlist"
                    className="btn btn-sm -mr-3.5 shrink-0 bg-transparent text-ink-foreground/70 hover:bg-ink-foreground/10 hover:text-ink-foreground"
                  >
                    All saved <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {movers.length === 0 ? (
                  <p className="mt-5 text-[13px] text-ink-foreground/60">
                    {items.length === 0
                      ? "Nothing saved yet. Save a piece and this is where its price and stock report in."
                      : "No movement among your saved pieces since you last looked."}
                  </p>
                ) : (
                  <div className="mt-5 divide-y divide-ink-foreground/15">
                    {movers.map(({ item, current, delta, priceMoved }) => {
                      const href = asProductId(item.id) ? `/product/${item.id}` : null
                      const inner = (
                        <>
                          <div className="min-w-0 flex-1">
                            <p className="label text-ink-foreground/50">{item.region.toUpperCase()}</p>
                            <h3 className="mt-1 truncate text-[15px] font-medium">{item.name}</h3>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            {priceMoved && (
                              <span className="num text-[13px] text-ink-foreground/50 line-through">
                                {formatNative(item.price, item.currency)}
                              </span>
                            )}
                            <span
                              className={`num display text-lg ${delta < 0 ? "text-signal" : "text-ink-foreground"}`}
                            >
                              {formatNative(current.price, current.currency)}
                            </span>
                            {priceMoved && (
                              <span className="num inline-flex items-center gap-1 text-[11px] font-semibold text-ink-foreground/70">
                                <TrendingDown className={`h-3 w-3 ${delta > 0 ? "rotate-180" : ""}`} />
                                {delta < 0 ? "−" : "+"}
                                {formatNative(Math.abs(delta), current.currency)}
                              </span>
                            )}
                            {!current.isAvailable && (
                              <span className="pill inline-flex items-center gap-1 bg-ink-foreground/10 px-2 py-0.5 text-[10px] font-semibold text-ink-foreground/70">
                                <PackageX className="h-3 w-3" />
                                Gone
                              </span>
                            )}
                          </div>
                        </>
                      )
                      const rowClass = "flex items-center gap-4 py-4"
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
              </>
            ) : authLoading ? null : (
              <div className="flex flex-col items-start gap-6 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="page-title text-[clamp(2rem,7vw,3.25rem)]">
                    Track a piece.
                  </h2>
                  <p className="mt-4 max-w-md text-[13px] text-ink-foreground/60">
                    <Heart className="mr-1.5 inline h-4 w-4 align-[-3px]" strokeWidth={1.8} />
                    Save anything in the catalogue and this page reports back when its price
                    moves, when a size returns, and when it is gone.
                  </p>
                </div>
                <Link href="/login" className="btn btn-lg shrink-0 bg-ink-foreground text-ink hover:opacity-90">
                  Sign in <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
