"use client"

/**
 * MOCK — direction D, "comparison-first".
 *
 * Parked on its own route so the live home page is untouched while this is
 * judged. Nothing links here.
 *
 * The first cut of this mock rendered a six-row price table per garment and
 * it came back three-quarters empty. That was not a rendering bug — it is the
 * shape of the business. Every Stüssy storefront serves its own territory and
 * nothing else; only the US store ships worldwide (lib/shipping.ts). So for a
 * reader anywhere, the real question is never "which of six" — it is:
 *
 *     my own store, or the US store, and how much is the difference?
 *
 * That is a two-sided comparison, it is a decision made every week, and no
 * page in the app has ever answered it. This one is built for exactly that
 * question and states the territorial fact once, up top, so the stores that
 * cannot reach the reader stop occupying rows.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { usePrefs } from "@/lib/prefs"
import { useFx } from "@/lib/use-fx"
import { cleanTitle } from "@/lib/title"
import { formatPrice, type FxRates } from "@/lib/currency"
import {
  estimateLandedCost,
  formatLanded,
  getDestination,
  type Destination,
  type LandedCost,
} from "@/lib/landed-cost"

interface Listing {
  id: string
  region: string
  price: number
  currency: string
  isAvailable: boolean
  availableSizesNormalised: string[]
  productUrl: string
}

interface StyleGroup {
  styleKey: string
  title: string
  category: string | null
  image: string | null
  publishedAt: string | null
  anyAvailable: boolean
  sizes: string[]
  availableSizes: string[]
  listings: Listing[]
}

const REGION_NAME: Record<string, string> = {
  us: "United States",
  uk: "United Kingdom",
  eu: "Europe",
  jp: "Japan",
  au: "Australia",
  sg: "Singapore",
}

interface Option {
  listing: Listing
  landed: LandedCost
}

/** A garment reduced to the choice the reader actually has: the stores that
 *  will both sell it and send it, cheapest first, plus what picking right is
 *  worth. `blocked` counts the stores that stock it and cannot reach here —
 *  reported once as a number rather than once per row as a dash. */
interface Choice {
  group: StyleGroup
  options: Option[]
  blocked: number
  /** Delivered difference between the best and next-best option, in USD.
   *  Zero when there is no second option to differ from. */
  savingUSD: number
}

function toChoice(g: StyleGroup, dest: Destination, rates?: FxRates): Choice {
  // One entry per store: several colourways of one garment in one store are
  // one shopping option, and the buyable one wins over the cheaper one.
  const byRegion = new Map<string, Listing>()
  for (const l of g.listings) {
    const held = byRegion.get(l.region)
    if (!held) byRegion.set(l.region, l)
    else if (!held.isAvailable && l.isAvailable) byRegion.set(l.region, l)
    else if (held.isAvailable === l.isAvailable && l.price < held.price) byRegion.set(l.region, l)
  }

  const options: Option[] = []
  let blocked = 0
  for (const listing of byRegion.values()) {
    if (!listing.isAvailable) continue
    const landed = estimateLandedCost(listing.price, listing.currency, listing.region, dest, rates)
    if (landed.deliverability === "ships") options.push({ listing, landed })
    else blocked++
  }
  options.sort((a, b) => a.landed.totalUSD - b.landed.totalUSD)

  return {
    group: g,
    options,
    blocked,
    savingUSD: options.length > 1 ? options[1].landed.totalUSD - options[0].landed.totalUSD : 0,
  }
}

export default function ComparisonMock() {
  const { prefs } = usePrefs()
  const { rates } = useFx()
  const [groups, setGroups] = useState<StyleGroup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch("/api/dropradar/styles?limit=60&sort=newest&available=true")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.success || !Array.isArray(json.data)) return
        setGroups(json.data)
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const dest = getDestination(prefs.destination)

  const { hero, ledger, oneWay, unreachable } = useMemo(() => {
    const all = groups.map((g) => toChoice(g, dest, rates))
    // Contested: more than one store will deliver it, so there is a decision
    // to make and a number attached to making it well.
    const contested = all.filter((c) => c.options.length > 1).sort((a, b) => b.savingUSD - a.savingUSD)
    // The hero takes the page's one photograph, so it is drawn from the
    // garments rather than the accessories: the largest gap overall is often
    // on a keychain, where a flat courier fee is most of the item's price.
    // Everything skipped here still appears at the top of the ledger, in the
    // same order, so nothing is hidden — only the cover shot is chosen.
    const HERO_FLOOR_USD = 100
    const heroPick = contested.find((c) => c.options[0].landed.totalUSD >= HERO_FLOOR_USD) ?? contested[0] ?? null
    return {
      hero: heroPick,
      ledger: contested.filter((c) => c !== heroPick).slice(0, 8),
      oneWay: all.filter((c) => c.options.length === 1).slice(0, 6),
      unreachable: all.filter((c) => c.options.length === 0).length,
    }
  }, [groups, dest, rates])

  const heroTitle = hero ? cleanTitle(hero.group.title) : null
  const reachable = useMemo(() => {
    const set = new Set<string>()
    for (const g of groups) for (const l of g.listings) set.add(l.region)
    return [...set].filter(
      (r) => estimateLandedCost(100, "USD", r, dest, rates).deliverability === "ships",
    )
  }, [groups, dest, rates])

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />

      <main id="main" className="flex-1 pb-nav pt-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="border-b border-border py-2.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Mock · direction D · comparison-first
          </p>

          {/* The territorial fact, stated once. Without it every empty column
              below reads as a broken page rather than as a closed border. */}
          {!loading && reachable.length > 0 && (
            <p className="pt-6 text-[13px] leading-relaxed text-muted-foreground sm:text-[14px]">
              <span className="text-foreground">Shipping to {dest.name}.</span> Of the six Stüssy
              storefronts, {reachable.length === 1 ? "only " : ""}
              <span className="text-foreground">
                {reachable.map((r) => REGION_NAME[r] ?? r.toUpperCase()).join(" and ")}
              </span>{" "}
              {reachable.length === 1 ? "delivers" : "deliver"} here — the rest serve their own
              territory only.{" "}
              {reachable.length === 1
                ? "So there is no choice to make; this is what it costs."
                : "So every garment below is the same question: which of the two, and by how much."}
            </p>
          )}

          {loading ? (
            <div className="py-24">
              <div className="image-loading h-4 w-40 rounded" />
            </div>
          ) : !hero || !heroTitle ? (
            <p className="py-24 text-[13px] text-muted-foreground">
              Nothing live right now is carried by more than one store that ships to {dest.name}.
            </p>
          ) : (
            <>
              {/* THE HERO — not the newest garment, the one where the choice
                  of store is worth the most money today. */}
              <section className="pt-10 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:pt-14">
                <Link href={`/product/${hero.options[0].listing.id}`} className="group block">
                  <div className="relative aspect-[4/5] w-full overflow-hidden bg-secondary/40">
                    {hero.group.image && (
                      <img
                        src={hero.group.image}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                      />
                    )}
                  </div>
                </Link>

                <div className="flex flex-col pt-7 lg:pt-0">
                  <p className="label">Biggest gap live today</p>
                  <h1 className="page-title mt-2 max-w-[16ch]">
                    {heroTitle.name}
                    {/* The colourway takes its own line rather than trailing
                        behind a mid-sentence separator: at this size the name
                        wraps on most garments, and a stranded "·" at a line
                        ending is worse than a clean second line. */}
                    {heroTitle.colour && (
                      <span className="block text-muted-foreground">{heroTitle.colour}</span>
                    )}
                  </h1>

                  {/* The comparison itself: the stores side by side, sticker
                      above delivered, because the sticker is what the store
                      shows you and the delivered figure is what you pay. */}
                  <div className="mt-8 grid grid-cols-2 gap-px bg-border">
                    {hero.options.slice(0, 2).map((o, i) => (
                      <Link
                        key={o.listing.id}
                        href={`/product/${o.listing.id}`}
                        className="group bg-background px-5 py-6 transition-colors hover:bg-secondary/50"
                      >
                        <p className="label">
                          {REGION_NAME[o.listing.region] ?? o.listing.region}
                          {i === 0 && <span className="text-foreground"> · cheaper</span>}
                        </p>
                        <p
                          className={`num mt-3 text-[26px] leading-none tracking-tight sm:text-[30px] ${
                            i === 0 ? "" : "text-muted-foreground"
                          }`}
                        >
                          {formatLanded(o.landed.totalUSD, dest, rates)}
                        </p>
                        <p className="num mt-2 text-[12px] text-muted-foreground">
                          {formatPrice(o.listing.price, o.listing.currency)} sticker
                          {o.landed.isCleanEstimate ? "" : " + shipping and import"}
                        </p>
                      </Link>
                    ))}
                  </div>

                  {/* The answer, as a number rather than a paragraph. */}
                  <p className="mt-6 text-[15px] leading-relaxed sm:text-[16px]">
                    Buying from{" "}
                    <span className="font-medium">{REGION_NAME[hero.options[0].listing.region]}</span>{" "}
                    saves{" "}
                    <span className="num font-medium">
                      {formatLanded(hero.savingUSD, dest, rates)}
                    </span>{" "}
                    delivered
                    {hero.blocked > 0 && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {hero.blocked} more {hero.blocked === 1 ? "store has" : "stores have"} it and
                        cannot ship here
                      </span>
                    )}
                    .
                  </p>

                  {hero.group.availableSizes.length > 0 && (
                    <p className="num mt-6 border-t border-border pt-4 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      {hero.group.availableSizes.slice(0, 12).join("  ·  ")}
                    </p>
                  )}
                </div>
              </section>

              {/* THE LEDGER — every other garment where the choice is worth
                  something, biggest first. Two prices and a difference. */}
              {ledger.length > 0 && (
                <section className="mt-20">
                  <div className="flex items-end justify-between gap-4">
                    <h2 className="label">Also worth checking · ranked by what the choice is worth</h2>
                    <Link href="/shop" className="btn btn-ghost btn-sm -mr-3.5 shrink-0">
                      Catalogue <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  <hr className="hairline-signal mt-4" />

                  {/* Columns are fixed to a store, never to a rank. A column
                      that means "the cheaper one" changes store between rows
                      and cannot be read down. */}
                  <div className="mt-1 hidden items-center gap-4 border-b border-border pb-2 pt-3 sm:flex">
                    <span className="w-14 shrink-0" />
                    <span className="label flex-1">Garment</span>
                    {reachable.map((r) => (
                      <span key={r} className="label w-24 shrink-0 text-right">
                        {r}
                      </span>
                    ))}
                    <span className="label w-24 shrink-0 text-right">Difference</span>
                  </div>

                  <div>
                    {ledger.map((c) => {
                      const t = cleanTitle(c.group.title)
                      const best = c.options[0]
                      const byRegion = new Map(c.options.map((o) => [o.listing.region, o]))
                      return (
                        <Link
                          key={c.group.styleKey}
                          href={`/product/${best.listing.id}`}
                          className="flex items-center gap-4 border-b border-border py-4 transition-colors hover:bg-secondary/50"
                        >
                          <div className="h-16 w-14 shrink-0 overflow-hidden bg-secondary/40">
                            {c.group.image && (
                              <img src={c.group.image} alt="" className="h-full w-full object-cover" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-[14px] font-medium">{t.name}</h3>
                            <p className="num mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground sm:hidden">
                              {c.options
                                .map((o) => `${o.listing.region} ${formatLanded(o.landed.totalUSD, dest, rates)}`)
                                .join("  ·  ")}
                            </p>
                            <p className="mt-0.5 hidden text-[11px] uppercase tracking-widest text-muted-foreground sm:block">
                              Cheaper from {REGION_NAME[best.listing.region] ?? best.listing.region}
                            </p>
                          </div>
                          {reachable.map((r) => {
                            const o = byRegion.get(r)
                            const isBest = o && o.listing.region === best.listing.region
                            return (
                              <span
                                key={r}
                                className={`num hidden w-24 shrink-0 text-right text-[13px] sm:block ${
                                  isBest ? "font-medium" : "text-muted-foreground"
                                }`}
                              >
                                {o ? formatLanded(o.landed.totalUSD, dest, rates) : "—"}
                              </span>
                            )
                          })}
                          <span className="num w-24 shrink-0 text-right text-[13px] font-medium">
                            {formatLanded(c.savingUSD, dest, rates)}
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* ONE STORE ONLY — no decision to make, but still buyable, and
                  a shopper who wants the garment does not care that it was
                  uncontested. Kept separate so the ledger above stays a
                  ledger. */}
              {oneWay.length > 0 && (
                <section className="mt-16">
                  <h2 className="label">One store only · no choice to make</h2>
                  <hr className="hairline-signal mt-4" />
                  <div className="mt-1 grid gap-x-8 sm:grid-cols-2">
                    {oneWay.map((c) => {
                      const t = cleanTitle(c.group.title)
                      const only = c.options[0]
                      return (
                        <Link
                          key={c.group.styleKey}
                          href={`/product/${only.listing.id}`}
                          className="flex items-center gap-4 border-b border-border py-3.5 transition-colors hover:bg-secondary/50"
                        >
                          <div className="h-11 w-10 shrink-0 overflow-hidden bg-secondary/40">
                            {c.group.image && (
                              <img src={c.group.image} alt="" className="h-full w-full object-cover" />
                            )}
                          </div>
                          <h3 className="min-w-0 flex-1 truncate text-[13px]">{t.name}</h3>
                          <span className="label shrink-0">{only.listing.region}</span>
                          <span className="num w-20 shrink-0 text-right text-[13px] font-medium">
                            {formatLanded(only.landed.totalUSD, dest, rates)}
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                </section>
              )}

              <p className="max-w-3xl py-12 text-[12px] leading-relaxed text-muted-foreground">
                Delivered figures are estimates to {dest.name}: the store's own sticker converted at
                today's rates, its own published shipping for this corridor, and the destination's
                import treatment.
                {unreachable > 0 && (
                  <>
                    {" "}
                    {unreachable} further {unreachable === 1 ? "garment is" : "garments are"} live in
                    stores that do not deliver here, and {unreachable === 1 ? "is" : "are"} left out
                    rather than listed at a price you cannot pay.
                  </>
                )}{" "}
                <Link href="/profile" className="underline underline-offset-4 hover:text-foreground">
                  Change destination
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
