"use client"

import { Suspense, useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Heart, Package, X } from "lucide-react"
import { toast } from "sonner"
import { ImageWithLoading } from "@/components/image-with-loading"
import { useWishlist } from "@/lib/wishlist-context"
import { Header } from "@/components/layout/header"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { CATEGORIES } from "@/lib/categories"
import { cleanTitle } from "@/lib/title"
import { usePrefs } from "@/lib/prefs"
import { useDisplayPrice } from "@/lib/display-price"
import { toUSD } from "@/lib/currency"

// The group shape served by /api/dropradar/styles: one entry per garment,
// with its regional listings folded inside.
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

// Chip order mirrors how the stores size garments: alpha run, waist run, OS.
// These are normalised tokens (matched against availableSizes), not per-store
// spellings.
const SIZE_CHIPS = ["XS", "S", "M", "L", "XL", "XXL", "28", "30", "32", "34", "36", "38", "OS"]

const REGION_ORDER = ["us", "uk", "eu", "jp", "au", "sg"]

const NUDGE_KEY = "itd_size_nudge_dismissed"

type SortBy = "newest" | "price_asc" | "price_desc"

/** The listing worth buying: cheapest in stock, ranked in USD because raw
 *  regional prices are not comparable (¥28000 is cheaper than £205). */
function cheapestAvailable(listings: Listing[]): Listing | null {
    let best: Listing | null = null
    let bestUSD = Infinity
    for (const l of listings) {
        if (!l.isAvailable) continue
        const usd = toUSD(l.price, l.currency)
        if (usd < bestUSD) {
            bestUSD = usd
            best = l
        }
    }
    return best
}

/** The styles payload carries no handle, but every storefront is Shopify and
 *  its product_url ends /products/<handle> — wishlist rows key on handle, so
 *  recover it rather than letting the context fall back to the listing id. */
function handleFromUrl(url: string): string | undefined {
    return url.match(/\/products\/([^/?#]+)/)?.[1]
}

function ShopPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { addItem, removeItem, isInWishlist } = useWishlist()
    const { prefs, setPrefs, isReady } = usePrefs()
    const fmt = useDisplayPrice()

    // Filter state lives in the URL, nowhere else — back/forward and shared
    // links restore the exact view, and there is no state to keep in sync.
    const category = searchParams.get("category") ?? ""
    const size = searchParams.get("size") ?? ""
    const inStockOnly = searchParams.get("stock") === "1"
    const rawSort = searchParams.get("sort")
    const sortBy: SortBy = rawSort === "price_asc" || rawSort === "price_desc" ? rawSort : "newest"

    const setParams = useCallback(
        (patch: Record<string, string | null>) => {
            const next = new URLSearchParams(searchParams.toString())
            for (const [key, value] of Object.entries(patch)) {
                if (value) next.set(key, value)
                else next.delete(key)
            }
            const qs = next.toString()
            router.replace(qs ? `/shop?${qs}` : "/shop", { scroll: false })
        },
        [router, searchParams],
    )

    const [groups, setGroups] = useState<StyleGroup[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [isPageLoaded, setIsPageLoaded] = useState(false)
    const [totalStyles, setTotalStyles] = useState<number | null>(null)

    const [offset, setOffset] = useState(0)
    const [hasMore, setHasMore] = useState(true)
    const LIMIT = 24

    // Monotonic id so a slow response from an earlier filter state can never
    // overwrite the results of a newer one.
    const requestSeq = useRef(0)

    useEffect(() => {
        setIsPageLoaded(true)
    }, [])

    useEffect(() => {
        setOffset(0)
        setGroups([])
        setHasMore(true)
        fetchGroups(0, true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category, size, inStockOnly, sortBy])

    const fetchGroups = async (currentOffset: number, reset = false) => {
        const seq = ++requestSeq.current
        if (reset) setIsLoading(true)
        else setIsLoadingMore(true)

        try {
            let url = `/api/dropradar/styles?limit=${LIMIT}&offset=${currentOffset}&sort=${sortBy}`
            if (category) url += `&category=${encodeURIComponent(category)}`
            if (size) url += `&size=${encodeURIComponent(size)}`
            if (inStockOnly) url += `&available=true`

            const response = await fetch(url)
            const data = await response.json()

            if (seq !== requestSeq.current) return // superseded by a newer request

            // The route answers a failure with 500 and {success:false,error},
            // which fetch resolves rather than throws — without this check a
            // server-side error renders as an empty catalogue.
            if (!response.ok || !data.success) {
                throw new Error(data.error || `Request failed (${response.status})`)
            }

            if (Array.isArray(data.data)) {
                if (reset) setGroups(data.data)
                else setGroups((prev) => [...prev, ...data.data])
                setHasMore(data.data.length === LIMIT)
                setOffset(currentOffset + LIMIT)
                if (typeof data.meta?.total === "number") setTotalStyles(data.meta.total)
            }
        } catch (error) {
            console.error("Error:", error)
            // A failed fetch leaves the grid empty, which renders as "no styles
            // found" — an answer about the catalogue rather than the request.
            if (seq === requestSeq.current) toast.error("Couldn't load the catalogue. Try again in a moment.")
        } finally {
            if (seq === requestSeq.current) {
                setIsLoading(false)
                setIsLoadingMore(false)
            }
        }
    }

    const loadMore = useCallback(() => {
        if (!isLoadingMore && hasMore) {
            fetchGroups(offset)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [offset, isLoadingMore, hasMore, category, size, inStockOnly, sortBy])

    const scrollRef = useInfiniteScroll(loadMore, { enabled: hasMore && !isLoading })

    // First-visit nudge: opens once when prefs load with no sizes and the
    // dismissal flag absent, then stays open so more than one size can be
    // tapped — hiding on the first tap would make a second size unreachable.
    const [nudgeOpen, setNudgeOpen] = useState(false)
    useEffect(() => {
        if (!isReady || prefs.sizes.length > 0) return
        try {
            if (!window.localStorage.getItem(NUDGE_KEY)) setNudgeOpen(true)
        } catch {
            // private mode — no flag to read, no flag worth writing
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isReady])

    const dismissNudge = () => {
        setNudgeOpen(false)
        try {
            window.localStorage.setItem(NUDGE_KEY, "1")
        } catch {
            // non-fatal: it just reappears next visit
        }
    }

    const toggleMySize = (s: string) => {
        setPrefs({
            sizes: prefs.sizes.includes(s) ? prefs.sizes.filter((x) => x !== s) : [...prefs.sizes, s],
        })
    }

    const handleWishlist = (group: StyleGroup, listing: Listing) => {
        const id = String(listing.id)
        if (isInWishlist(id)) {
            removeItem(id)
        } else {
            addItem({
                id,
                name: group.title,
                price: listing.price,
                currency: listing.currency,
                image: group.image ?? "",
                url: listing.productUrl || `/product/${id}`,
                region: listing.region,
                handle: handleFromUrl(listing.productUrl),
            })
        }
    }

    const clearFilters = () => router.replace("/shop", { scroll: false })
    const hasActiveFilters = !!category || !!size || inStockOnly

    const chip = (active: boolean) => `chip shrink-0 ${active ? "chip-on" : ""}`

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Header />

            <main className="pt-12 pb-nav">
                <div className="px-4 lg:px-8 pt-8 pb-5">
                    {/* Not "Latest drops" — that is the other page's name, and the two
                        side by side in the bottom nav read as one page duplicated. */}
                    <h1 className="display text-2xl md:text-3xl">Catalogue</h1>
                    <p className="num text-[13px] text-muted-foreground mt-1">
                        {totalStyles !== null ? `${totalStyles.toLocaleString()} styles across 6 stores` : "Every garment, every store"}
                    </p>
                    <hr className="hairline-signal mt-5" />
                </div>

                {/* Filters: chip rows that scroll sideways on a phone. Regions are
                    attributes on the cards now, not a filter axis. */}
                <div className="space-y-2.5 pb-5">
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-4 lg:px-8">
                        <button onClick={() => setParams({ category: null })} className={chip(!category)}>
                            All
                        </button>
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.key}
                                onClick={() => setParams({ category: category === cat.key ? null : cat.key })}
                                className={chip(category === cat.key)}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-4 lg:px-8">
                        {SIZE_CHIPS.map((s) => (
                            <button
                                key={s}
                                onClick={() => setParams({ size: size === s ? null : s })}
                                className={`${chip(size === s)} min-w-9 justify-center`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide px-4 lg:px-8">
                        <button onClick={() => setParams({ stock: inStockOnly ? null : "1" })} className={chip(inStockOnly)}>
                            In stock
                        </button>
                        <span className="shrink-0 w-px h-4 bg-border mx-1" aria-hidden />
                        {(
                            [
                                ["newest", "Newest"],
                                ["price_asc", "Price ↑"],
                                ["price_desc", "Price ↓"],
                            ] as const
                        ).map(([value, label]) => (
                            <button
                                key={value}
                                onClick={() => setParams({ sort: value === "newest" ? null : value })}
                                className={chip(sortBy === value)}
                            >
                                {label}
                            </button>
                        ))}
                        {hasActiveFilters && (
                            <button onClick={clearFilters} className="btn btn-ghost btn-sm shrink-0">
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                {nudgeOpen && (
                    // A card, not another chip row — rendered as a bare row it sat
                    // directly under the size FILTER row and read as the same
                    // control duplicated.
                    <div className="mx-4 lg:mx-8 mb-6 rounded-2xl bg-secondary p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[13px] font-semibold">What sizes do you wear?</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Cards, drops and alerts will flag anything in your size.
                                </p>
                            </div>
                            <button onClick={dismissNudge} aria-label="Dismiss" className="btn btn-ghost btn-icon shrink-0 -mt-1 -mr-1">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide mt-3">
                            {SIZE_CHIPS.map((s) => (
                                <button
                                    key={s}
                                    onClick={() => toggleMySize(s)}
                                    // On the card's bg-secondary surface the resting chip
                                    // needs its own ground or it disappears.
                                    className={`${chip(prefs.sizes.includes(s))} min-w-9 justify-center ${prefs.sizes.includes(s) ? "" : "!bg-background"}`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="px-4 lg:px-8">
                    {isLoading ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="space-y-2">
                                    <div className="aspect-[3/4] bg-muted animate-pulse rounded-2xl" />
                                    <div className="h-3 bg-muted animate-pulse w-3/4 rounded" />
                                    <div className="h-3 bg-muted animate-pulse w-1/3 rounded" />
                                </div>
                            ))}
                        </div>
                    ) : groups.length === 0 ? (
                        <div className="text-center py-20">
                            <Package className="w-10 h-10 mx-auto text-muted-foreground mb-4" strokeWidth={1.5} />
                            <p className="text-sm text-muted-foreground">No styles found</p>
                            {hasActiveFilters && (
                                <button onClick={clearFilters} className="btn btn-secondary mt-5">
                                    Clear filters
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
                            {groups.map((group, index) => {
                                if (group.listings.length === 0) return null
                                const cheapest = cheapestAvailable(group.listings)
                                // The price shown is what the garment actually
                                // costs to buy right now; sold out everywhere,
                                // the first listing stands in as a reference.
                                const priced = cheapest ?? group.listings[0]
                                // The listing the card opens (and the heart
                                // saves): the shopper's own store first, else
                                // the one worth buying, else anything.
                                const destination = prefs.destination.toLowerCase()
                                const chosen =
                                    group.listings.find((l) => l.region === destination) ?? cheapest ?? group.listings[0]
                                const chosenId = String(chosen.id)
                                const inWishlist = isInWishlist(chosenId)
                                const inMySize =
                                    prefs.sizes.length > 0 && prefs.sizes.some((s) => group.availableSizes.includes(s))
                                // One chip per REGION, not per listing — a garment in four
                                // colourways per store rendered "US US US US UK UK…", which
                                // reads as a bug because it was one. A region counts as
                                // available if any of its colourways is.
                                const regionAvail = new Map<string, boolean>()
                                for (const l of group.listings) {
                                    regionAvail.set(l.region, (regionAvail.get(l.region) ?? false) || l.isAvailable)
                                }
                                const regions = [...regionAvail.entries()]
                                    .map(([region, isAvailable]) => ({ region, isAvailable }))
                                    .sort((a, b) => REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region))
                                const { name: cardName, colour: cardColour } = cleanTitle(group.title)
                                return (
                                    <div
                                        key={group.styleKey}
                                        className={`group transition-opacity duration-300 ${isPageLoaded ? "opacity-100" : "opacity-0"}`}
                                        style={{ transitionDelay: `${Math.min(index * 15, 150)}ms` }}
                                    >
                                        <div className="relative aspect-[3/4] bg-secondary rounded-2xl overflow-hidden">
                                            {inMySize && (
                                                <span className="pill absolute top-3 left-3 z-20 bg-primary text-primary-foreground px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide">
                                                    In your size
                                                </span>
                                            )}
                                            <button
                                                onClick={() => handleWishlist(group, chosen)}
                                                aria-label="Toggle wishlist"
                                                className={`pill absolute top-3 right-3 z-20 w-8 h-8 flex items-center justify-center transition-all ${
                                                    inWishlist
                                                        ? "bg-primary text-primary-foreground"
                                                        : "bg-background/90 backdrop-blur text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-foreground"
                                                }`}
                                            >
                                                <Heart className={`w-3.5 h-3.5 ${inWishlist ? "fill-current" : ""}`} />
                                            </button>
                                            {!group.anyAvailable && (
                                                <div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-[2px] flex items-center justify-center">
                                                    <span className="pill bg-background px-3 py-1.5 text-xs font-medium">Sold out</span>
                                                </div>
                                            )}
                                            <Link href={`/product/${chosenId}`} className="block w-full h-full">
                                                <ImageWithLoading
                                                    src={group.image ?? ""}
                                                    alt={group.title}
                                                    className="w-full h-full object-cover product-image-zoom"
                                                />
                                            </Link>
                                        </div>
                                        <Link href={`/product/${chosenId}`} className="block mt-3 px-1">
                                            <div className="flex items-baseline justify-between gap-3">
                                                <h3 className="text-[13px] font-medium leading-snug line-clamp-2">
                                                    {cardName}
                                                    {cardColour && (
                                                        <span className="text-muted-foreground font-normal"> · {cardColour}</span>
                                                    )}
                                                </h3>
                                                <p className={`num text-[13px] shrink-0 ${group.anyAvailable ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                                                    {fmt(priced.price, priced.currency)}
                                                </p>
                                            </div>
                                            {/* The stores carrying it; the one whose price is shown is marked. */}
                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                {regions.map((l) => (
                                                    <span
                                                        key={l.region}
                                                        className={`text-[10px] uppercase tracking-wide leading-none ${
                                                            cheapest && l.region === cheapest.region
                                                                ? "text-foreground font-semibold"
                                                                : l.isAvailable
                                                                  ? "text-muted-foreground"
                                                                  : "text-muted-foreground/40 line-through"
                                                        }`}
                                                    >
                                                        {l.region}
                                                    </span>
                                                ))}
                                            </div>
                                        </Link>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {hasMore && groups.length > 0 && (
                        <div ref={scrollRef} className="mt-8 flex flex-col items-center gap-4">
                            {isLoadingMore ? (
                                <div className="text-[13px] text-muted-foreground">Loading…</div>
                            ) : (
                                <button onClick={() => loadMore()} className="btn btn-secondary">
                                    Load more
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}

export default function ShopPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <ShopPageContent />
        </Suspense>
    )
}
