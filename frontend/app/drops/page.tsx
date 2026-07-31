"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Sparkles,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  PackageX,
  Ruler,
  Archive,
  Megaphone,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { ImageWithLoading } from "@/components/image-with-loading"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { toUSD } from "@/lib/currency"
import { useDisplayPrice } from "@/lib/display-price"
import { usePrefs } from "@/lib/prefs"
import { cleanTitle } from "@/lib/title"
import { supabase } from "@/lib/supabase"

interface Drop {
  id: string
  product_id: string | null
  region: string
  change_type: string
  title: string
  price: number
  currency: string
  image_url: string
  product_url: string
  old_value: string
  new_value: string
  available_sizes: string[]
  detected_at: string
}

/** What the products table says about a listing right now — the drops table
 *  records what happened, not what is still true of it. */
interface LiveState {
  is_available: boolean
  available_sizes_normalised: string[] | null
  style_code: string | null
}

/** One garment inside a drop cluster: every regional copy of the style,
 *  folded into a single card. */
interface DropCard {
  key: string
  title: string
  image_url: string
  href: string
  price: number
  currency: string
  regions: string[]
  /** Every merged listing reports is_available === false. Listings the
   *  enrichment couldn't resolve count as unknown and block this — dimming a
   *  card that might still be buyable is worse than not dimming one. */
  gone: boolean
  inYourSize: boolean
}

interface DropCluster {
  key: string
  /** detected_at of the cluster's latest event — what the section is dated by. */
  endIso: string
  cards: DropCard[]
  regions: string[]
}

// The chips are intents, not raw change_type values — but each maps onto one,
// so the URL stays ?type=&region= exactly as before.
const INTENTS = [
  { id: "", label: "Everything" },
  { id: "new", label: "Latest drop" },
  { id: "price_drop", label: "Price cuts" },
  { id: "restock", label: "Restocks" },
  { id: "sold_out", label: "Sold out" },
]

const TYPE_META: Record<string, { label: string; icon: typeof Sparkles; tone: string }> = {
  new: { label: "New", icon: Sparkles, tone: "bg-primary text-primary-foreground" },
  restock: { label: "Restock", icon: RotateCcw, tone: "bg-primary text-primary-foreground" },
  size_restock: { label: "Size back", icon: Ruler, tone: "bg-secondary text-foreground" },
  price_drop: { label: "Price cut", icon: TrendingDown, tone: "bg-signal text-signal-foreground" },
  price_increase: { label: "Price up", icon: TrendingUp, tone: "bg-secondary text-muted-foreground" },
  sold_out: { label: "Sold out", icon: PackageX, tone: "bg-secondary text-muted-foreground" },
  size_sold_out: { label: "Size gone", icon: PackageX, tone: "bg-secondary text-muted-foreground" },
  // Not "sold out": all the scraper observed is that the store stopped
  // publishing the listing (migration 022).
  delisted: { label: "Pulled", icon: Archive, tone: "bg-secondary text-muted-foreground" },
}

/** A change type this page has no entry for. The fallback used to be
 *  TYPE_META.new, which dressed unknown events — including 'delisted', before
 *  it had an entry — in a "New" badge, the exact opposite of what happened. */
const UNKNOWN_META = { label: "Update", icon: Megaphone, tone: "bg-secondary text-muted-foreground" }

const REGIONS = ["", "us", "uk", "eu", "jp", "au", "sg"]
const REGION_ORDER = ["us", "uk", "eu", "jp", "au", "sg"]

// A release is a burst of scraper events, not one timestamp: six storefronts
// publish the same drop over an afternoon. Events joined into one "Drop" while
// each arrives within two hours of the previous one — the window rolls, so a
// straggler twenty minutes after the last event still belongs.
const CLUSTER_GAP_MS = 2 * 60 * 60 * 1000

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/** "Today" / "Yesterday" / "Jul 18" — a plain date when the event is old, so a
 *  stale cluster never dresses itself up as breaking news. */
function dayLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const daysApart = Math.round((today - day) / 86400000)
  if (daysApart === 0) return "Today"
  if (daysApart === 1) return "Yesterday"
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
  })
}

function sortRegions(regions: Iterable<string>): string[] {
  const pos = (r: string) => {
    const i = REGION_ORDER.indexOf(r)
    return i === -1 ? REGION_ORDER.length : i
  }
  return Array.from(new Set(regions)).sort((a, b) => pos(a) - pos(b))
}

/** Gettable-first: something in the shopper's size leads, everything
 *  confirmed gone trails. */
function gettableRank(c: DropCard) {
  if (c.gone) return 2
  return c.inYourSize ? 0 : 1
}

function buildClusters(drops: Drop[], live: Map<string, LiveState>, mySizes: string[]): DropCluster[] {
  const fresh = drops
    .filter((d) => d.change_type === "new")
    .slice()
    .sort((a, b) => new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime())
  if (fresh.length === 0) return []

  const groups: Drop[][] = []
  let current: Drop[] = []
  let lastT = 0
  for (const d of fresh) {
    const t = new Date(d.detected_at).getTime()
    if (current.length > 0 && t - lastT > CLUSTER_GAP_MS) {
      groups.push(current)
      current = []
    }
    current.push(d)
    lastT = t
  }
  groups.push(current)

  const clusters = groups.map((group): DropCluster => {
    // Cross-region copies of one garment collapse into one card. style_code is
    // the real identity but lives on products, not drops — it arrives with the
    // enrichment; until then (or for rows with no product_id) the normalised
    // title has to stand in for it.
    const merged = new Map<string, Drop[]>()
    for (const d of group) {
      const style = d.product_id ? live.get(d.product_id)?.style_code : null
      const key = style || d.title.toLowerCase().replace(/\s+/g, " ").trim()
      const entry = merged.get(key)
      if (entry) entry.push(d)
      else merged.set(key, [d])
    }

    const cards = Array.from(merged.entries()).map(([key, copies]): DropCard => {
      const states = copies.map((c) => (c.product_id ? live.get(c.product_id) : undefined))
      const gone = states.every((s) => s?.is_available === false)
      const sizes = new Set<string>()
      for (const s of states) for (const x of s?.available_sizes_normalised ?? []) sizes.add(x)
      const inYourSize = mySizes.some((s) => sizes.has(s))
      // The copy shown is the cheapest still-buyable one (comparison has to
      // happen in USD — raw numbers across six currencies rank ¥ above £).
      const ranked = copies
        .map((c, i) => ({ c, s: states[i], usd: toUSD(c.price, c.currency) }))
        .sort((a, b) => a.usd - b.usd)
      const primary = ranked.find((r) => r.s?.is_available !== false) ?? ranked[0]
      return {
        key,
        title: primary.c.title,
        image_url: primary.c.image_url,
        href: primary.c.product_id ? `/product/${primary.c.product_id}` : primary.c.product_url,
        price: primary.c.price,
        currency: primary.c.currency,
        regions: sortRegions(copies.map((c) => c.region)),
        gone,
        inYourSize,
      }
    })

    cards.sort((a, b) => gettableRank(a) - gettableRank(b))

    return {
      key: group[0].detected_at,
      endIso: group[group.length - 1].detected_at,
      cards,
      regions: sortRegions(group.map((g) => g.region)),
    }
  })

  return clusters.reverse()
}

function ClusterCard({ card, fmt }: { card: DropCard; fmt: (price: number, currency: string) => string }) {
  return (
    <div className={card.gone ? "opacity-60" : ""}>
      <div className="card-lift relative aspect-[3/4] bg-secondary rounded-2xl overflow-hidden">
        <div className="absolute top-3 left-3 z-20 flex flex-col items-start gap-1.5">
          <div className="flex flex-wrap gap-1">
            {card.regions.map((r) => (
              <span key={r} className="pill bg-background/90 backdrop-blur px-2 py-0.5 text-[10px] font-medium uppercase">
                {r}
              </span>
            ))}
          </div>
          {card.inYourSize && !card.gone && (
            <span className="pill bg-signal text-signal-foreground px-2.5 py-1 text-[10px] font-semibold">
              In your size
            </span>
          )}
        </div>
        {card.gone && (
          <div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-[2px] flex items-center justify-center">
            <span className="pill bg-background px-3 py-1.5 text-xs font-medium">Gone</span>
          </div>
        )}
        <Link href={card.href} className="block w-full h-full">
          <ImageWithLoading src={card.image_url} alt={card.title} className="w-full h-full object-cover" />
        </Link>
      </div>
      <Link href={card.href} className="flex items-baseline justify-between gap-3 mt-3 px-1">
        {(() => {
          const { name, colour } = cleanTitle(card.title)
          return (
            <h3 className="text-[13px] font-medium leading-snug line-clamp-2">
              {name}
              {colour && <span className="text-muted-foreground font-normal"> · {colour}</span>}
            </h3>
          )
        })()}
        <p className="num text-[13px] text-muted-foreground shrink-0">{fmt(card.price, card.currency)}</p>
      </Link>
    </div>
  )
}

export default function DropsPage() {
  const [drops, setDrops] = useState<Drop[]>([])
  const [live, setLive] = useState<Map<string, LiveState>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [changeType, setChangeType] = useState("")
  const [region, setRegion] = useState("")
  // Filters come from the URL, which only exists client-side; nothing fetches
  // until they are read, so a link to ?type=price_drop never flashes the
  // unfiltered feed first.
  const [filtersReady, setFiltersReady] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const { prefs } = usePrefs()
  const fmt = useDisplayPrice()

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const t = sp.get("type")
    if (t && INTENTS.some((i) => i.id === t)) setChangeType(t)
    const r = sp.get("region")
    if (r && REGIONS.includes(r)) setRegion(r)
    setFiltersReady(true)
  }, [])

  useEffect(() => {
    if (!filtersReady) return
    const sp = new URLSearchParams()
    if (changeType) sp.set("type", changeType)
    if (region) sp.set("region", region)
    const qs = sp.toString()
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname)
  }, [changeType, region, filtersReady])

  const fetchDrops = useCallback(async () => {
    setIsLoading(true)
    try {
      const base = new URLSearchParams()
      if (changeType) base.set("type", changeType)
      if (region) base.set("region", region)
      // The route clamps limit to 100 (a limit=200 request falls back to 50),
      // so 200 events take two pages.
      const page = async (offset: number): Promise<Drop[]> => {
        const sp = new URLSearchParams(base)
        sp.set("limit", "100")
        sp.set("offset", String(offset))
        const res = await fetch(`/api/dropradar/drops?${sp.toString()}`)
        const json = await res.json()
        return json?.success && Array.isArray(json.data) ? json.data : []
      }
      const first = await page(0)
      const second = first.length === 100 ? await page(100) : []
      setDrops([...first, ...second])
    } catch {
      setDrops([])
    } finally {
      setIsLoading(false)
    }
  }, [changeType, region])

  useEffect(() => {
    if (filtersReady) fetchDrops()
  }, [fetchDrops, filtersReady])

  // Enrichment: the feed is a log, so it can't say whether a piece is still
  // buyable or in what sizes. Read that live from the products table in bulk.
  // Any failure just leaves the map empty — cards render without live state.
  useEffect(() => {
    const ids = Array.from(new Set(drops.map((d) => d.product_id).filter((id): id is string => !!id)))
    if (ids.length === 0) {
      setLive(new Map())
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const chunks: string[][] = []
        for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
        const results = await Promise.all(
          chunks.map((chunk) =>
            supabase
              .from("products")
              .select("id,is_available,available_sizes_normalised,style_code")
              .in("id", chunk)
          )
        )
        const map = new Map<string, LiveState>()
        for (const { data, error } of results) {
          if (error) throw error
          for (const row of (data ?? []) as (LiveState & { id: string })[]) {
            map.set(row.id, row)
          }
        }
        if (!cancelled) setLive(map)
      } catch {
        if (!cancelled) setLive(new Map())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [drops])

  const clusters = useMemo(() => buildClusters(drops, live, prefs.sizes), [drops, live, prefs.sizes])

  // Non-new events, grouped under day headers. The API already returns them
  // newest-first, so grouping only has to notice the day changing.
  const telemetryDays = useMemo(() => {
    const days: { key: string; label: string; rows: Drop[] }[] = []
    for (const d of drops) {
      if (d.change_type === "new") continue
      const key = new Date(d.detected_at).toDateString()
      const last = days[days.length - 1]
      if (last && last.key === key) last.rows.push(d)
      else days.push({ key, label: dayLabel(d.detected_at), rows: [d] })
    }
    return days
  }, [drops])

  const hero = clusters[0]
  const earlier = clusters.slice(1)
  const showTelemetry = changeType !== "new" && telemetryDays.length > 0

  const toggleCluster = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      <main id="main" className="flex-1 pt-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="pt-8 pb-6">
            <p className="label mb-1.5 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-signal" aria-hidden />
              Live feed
            </p>
            <h1 className="display text-2xl md:text-3xl">What dropped</h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              Every new release, restock and price change across six regions.
            </p>
            <hr className="hairline-signal mt-5" />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-1.5 pb-8">
            {INTENTS.map((t) => (
              <button
                key={t.id || "all"}
                onClick={() => setChangeType(t.id)}
                className={`chip ${changeType === t.id ? "chip-on" : ""}`}
              >
                {t.label}
              </button>
            ))}
            <span className="w-px h-4 bg-border mx-1.5" />
            {REGIONS.map((r) => (
              <button
                key={r || "all"}
                onClick={() => setRegion(r)}
                className={`chip uppercase ${region === r ? "chip-on" : ""}`}
              >
                {r || "All"}
              </button>
            ))}
          </div>

          {isLoading || !filtersReady ? (
            <div className="pb-16">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-8 pb-10">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-3">
                    <div className="aspect-[3/4] rounded-2xl image-loading" />
                    <div className="h-3 w-2/3 rounded image-loading" />
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 rounded-2xl bg-secondary p-3">
                    <div className="w-14 h-16 rounded-xl image-loading" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 rounded image-loading" />
                      <div className="h-3 w-1/5 rounded image-loading" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : drops.length === 0 ? (
            // An empty region is a true statement, not a failure: this feed
            // only holds events a scrape actually witnessed, and a quiet or
            // newly-covered region (SG's catalogue was backfilled without
            // fabricating events) legitimately has none. Say that, rather
            // than a generic "nothing here" that reads as broken.
            <div className="text-center py-24">
              <Sparkles className="w-9 h-9 mx-auto text-muted-foreground mb-4" strokeWidth={1.5} />
              <p className="text-[15px] font-semibold mb-1">
                {region
                  ? `No drops witnessed in ${region.toUpperCase()} yet`
                  : "Nothing here yet"}
              </p>
              <p className="text-[13px] text-muted-foreground max-w-xs mx-auto">
                This feed only shows changes the tracker has actually seen
                happen. The next release, restock, price change or sell-out
                {region ? ` in ${region.toUpperCase()}` : ""} will appear here
                the moment a scrape catches it.
              </p>
              {(changeType || region) && (
                <button
                  onClick={() => {
                    setChangeType("")
                    setRegion("")
                  }}
                  className="btn btn-secondary btn-sm mt-5"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="pb-16">
              {/* Hero: the most recent drop cluster, dated honestly */}
              {hero && (
                <section className="pb-12">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-5">
                    <h2 className="display text-xl md:text-2xl">Drop — {dayLabel(hero.endIso)}</h2>
                    <p className="num text-[13px] text-muted-foreground">
                      {hero.cards.length} piece{hero.cards.length === 1 ? "" : "s"} ·{" "}
                      <span className="uppercase">{hero.regions.join(" · ")}</span>
                    </p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-8">
                    {hero.cards.map((card, i) => (
                      <div
                        key={card.key}
                        className="opacity-0 animate-rise"
                        style={{ animationDelay: `${Math.min(i * 60, 360)}ms` }}
                      >
                        <ClusterCard card={card} fmt={fmt} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Earlier drops, collapsed */}
              {earlier.length > 0 && (
                <section className="pb-12">
                  <p className="label mb-3">Earlier drops</p>
                  <div className="space-y-2">
                    {earlier.map((cluster) => {
                      const isOpen = expanded.has(cluster.key)
                      const Chevron = isOpen ? ChevronDown : ChevronRight
                      return (
                        <div key={cluster.key}>
                          <button
                            onClick={() => toggleCluster(cluster.key)}
                            className="btn btn-secondary btn-lg w-full justify-between gap-3 px-4 text-left"
                          >
                            <span className="num text-[13px] font-medium">
                              {dayLabel(cluster.endIso)} — {cluster.cards.length} piece
                              {cluster.cards.length === 1 ? "" : "s"}
                            </span>
                            <span className="flex items-center gap-2 text-[11px] uppercase text-muted-foreground shrink-0">
                              {cluster.regions.join(" · ")}
                              <Chevron className="w-3.5 h-3.5" />
                            </span>
                          </button>
                          {isOpen && (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-8 pt-4 pb-6">
                              {cluster.cards.map((card) => (
                                <ClusterCard key={card.key} card={card} fmt={fmt} />
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Telemetry: everything that isn't a release */}
              {showTelemetry && (
                <section>
                  {clusters.length > 0 && <p className="label mb-3">Telemetry</p>}
                  <div className="space-y-6">
                    {telemetryDays.map((day) => (
                      <div key={day.key}>
                        <p className="label mb-2">{day.label}</p>
                        <div className="space-y-2">
                          {day.rows.map((drop) => {
                            const meta = TYPE_META[drop.change_type] || UNKNOWN_META
                            const Icon = meta.icon
                            const href = drop.product_id ? `/product/${drop.product_id}` : drop.product_url
                            const oldPrice =
                              drop.change_type === "price_drop" && drop.old_value
                                ? parseFloat(drop.old_value)
                                : null
                            const pctOff =
                              oldPrice && oldPrice > drop.price
                                ? Math.round((1 - drop.price / oldPrice) * 100)
                                : 0
                            return (
                              <Link
                                key={drop.id}
                                href={href}
                                className="card-lift flex items-center gap-4 rounded-2xl bg-secondary p-3 pr-5"
                              >
                                <div className="w-14 h-16 rounded-xl overflow-hidden bg-background shrink-0">
                                  <ImageWithLoading
                                    src={drop.image_url}
                                    alt={drop.title}
                                    className="w-full h-full object-cover"
                                  />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span
                                      className={`pill inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold ${meta.tone}`}
                                    >
                                      <Icon className="w-3 h-3" />
                                      {meta.label}
                                    </span>
                                    <span className="text-[11px] uppercase text-muted-foreground">{drop.region}</span>
                                  </div>
                                  <h3 className="text-[13px] font-medium truncate">{cleanTitle(drop.title).name}</h3>
                                  {oldPrice !== null && (
                                    <p className="num text-[12px] text-muted-foreground">
                                      <span className="line-through">{fmt(oldPrice, drop.currency)}</span>
                                      {" → "}
                                      <span className="text-signal font-medium">{fmt(drop.price, drop.currency)}</span>
                                      {pctOff > 0 && (
                                        <span className="text-signal font-medium"> · {pctOff}% off</span>
                                      )}
                                    </p>
                                  )}
                                  {drop.change_type === "size_restock" && drop.new_value && (
                                    <p className="text-[12px] text-muted-foreground">Sizes back: {drop.new_value}</p>
                                  )}
                                </div>

                                <div className="text-right shrink-0">
                                  <p className="num text-[13px] font-medium">{fmt(drop.price, drop.currency)}</p>
                                  <p className="num text-[11px] text-muted-foreground">{timeAgo(drop.detected_at)}</p>
                                </div>
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
