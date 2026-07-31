"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Heart, ExternalLink, Share2, Bell, Check, Globe } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"
import { useWishlist } from "@/lib/wishlist-context"
import { Header } from "@/components/layout/header"
import { PriceHistoryChart } from "@/components/product/price-history-chart"
import { PriceAlertModal } from "@/components/product/price-alert-modal"
import { formatPrice, toUSD } from "@/lib/currency"
import { bestOfferPerRegion, estimateLandedCost, formatDisplay, formatLanded, getDestination, toDisplayCost } from "@/lib/landed-cost"
import { usePrefs } from "@/lib/prefs"
import { useDisplayPrice } from "@/lib/display-price"
import { useFx } from "@/lib/use-fx"
import { usePriceStats, priceVerdict } from "@/lib/use-price-stats"
import { scarcity } from "@/lib/scarcity"
import { DestinationSelect } from "@/components/ui/destination-select"
import { RegionAlertCard } from "@/components/product/region-alert-card"
import { SizeAvailability } from "@/components/product/size-availability"
import { SelloutVelocity } from "@/components/product/sellout-velocity"

interface Product {
  id: string
  shopify_id: number
  region: string
  handle: string
  title: string
  vendor: string
  product_type: string
  tags: string[]
  price: number
  compare_price: number | null
  currency: string
  is_available: boolean
  available_sizes: string[]
  all_sizes?: string[]
  /** Cross-region size vocabulary (migration 021); absent until rescraped. */
  all_sizes_normalised?: string[]
  available_sizes_normalised?: string[]
  total_variants: number
  available_variants?: number
  image_url: string
  product_url: string
  first_seen_at: string
  last_seen_at: string
  color?: string
  /** Cross-region garment identity; falls back to the handle server-side. */
  style_code?: string
}

/** Resolved on the server for the JSON-LD, so both arrive with the HTML and
 *  the browser has no reason to ask for them again. */
interface ProductDetailProps {
  initialProduct?: Product | null
  initialSiblings?: Product[]
}

const REGION_FLAGS: Record<string, string> = {
  us: "US",
  uk: "UK",
  eu: "EU",
  jp: "JP",
  au: "AU",
  sg: "SG",
}

function ProductDetailContent({ initialProduct, initialSiblings }: ProductDetailProps) {
  const params = useParams()
  const productId = (initialProduct?.id ?? params.id) as string
  const { user } = useAuth()
  const { addItem, removeItem, isInWishlist } = useWishlist()

  const [product, setProduct] = useState<Product | null>(initialProduct ?? null)
  const [relatedProducts, setRelatedProducts] = useState<Product[]>(
    (initialSiblings ?? []).filter((p) => p.id !== initialProduct?.id)
  )
  const [isLoading, setIsLoading] = useState(!initialProduct)
  const [alertModalOpen, setAlertModalOpen] = useState(false)
  // Destination lives in prefs, not page state, so the choice made here is
  // the same one the shop grid and every other product page use — pick
  // Singapore once and stay bought-into-Singapore everywhere.
  const { prefs, setPrefs, isReady: prefsReady } = usePrefs()
  const destination = getDestination(prefs.destination)
  const setDestination = useCallback(
    (code: string) => setPrefs({ destination: code }),
    [setPrefs]
  )
  const displayPrice = useDisplayPrice()
  const { rates: fx } = useFx()
  const priceStats = usePriceStats(product?.id)
  const verdict = product
    ? priceVerdict(product.price, priceStats)
    : { label: null, isLow: false }
  const left = product ? scarcity(product.available_variants, product.total_variants) : null

  // Compared against item.id only, which never held a product id — so the
  // heart on this page stayed empty for an item that was in fact saved.
  const isWishlisted = isInWishlist(productId)

  // Regional offers ranked by ESTIMATED DELIVERED cost, not sticker price:
  // the cheapest tag can land dearer once shipping and duty are added.
  const rankedOffers = useMemo(
    () =>
      product
        ? bestOfferPerRegion([product, ...relatedProducts], destination, product.color, fx)
        : [],
    [product, relatedProducts, destination, fx]
  )

  // Buyable means in stock AND a store that will ship here: a cheaper price
  // from a store that does not serve this country is not an offer at all.
  const best = rankedOffers.find(
    (r) => r.offer.is_available !== false && r.landed.deliverability === "ships"
  )
  const bestOffer = best?.offer

  // Which regions carry this garment at all, and whether the shopper's own
  // is among them. If it isn't, importing is the only option today — so
  // offer to watch for a local release instead.
  const stockedRegions = useMemo(
    () => Array.from(new Set(rankedOffers.map((r) => r.offer.region))),
    [rankedOffers]
  )
  // Null where no storefront serves the destination locally, which is most of
  // them — there are five stores and fifteen destinations. "Watch for a local
  // release" is not an offer you can make to Hong Kong or Thailand: there is no
  // local store to release anything.
  const localRegion = destination.domesticRegion
  const stockedLocally = localRegion !== null && stockedRegions.includes(localRegion)

  const currentLanded = useMemo(
    () =>
      product
        ? estimateLandedCost(product.price, product.currency, product.region, destination, fx)
        : null,
    [product, destination, fx]
  )

  // Only claim a saving when the alternative genuinely lands cheaper.
  const savingsUSD =
    currentLanded && best && best.offer.id !== product?.id
      ? currentLanded.totalUSD - best.landed.totalUSD
      : 0

  // For each of the shopper's sizes, the regions where it is in stock right
  // now — the intersection the verdict banner reads out. Matched on the
  // normalised vocabulary only: raw available_sizes are per-store spellings.
  // Rows scraped before migration 021 have no normalised column at all, and an
  // absent column is not an empty one — hasNormalised keeps the banner from
  // reading "no data yet" as "none of your sizes anywhere".
  const hasNormalised = rankedOffers.some((r) => r.offer.available_sizes_normalised !== undefined)
  const sizeMatches = useMemo(() => {
    if (prefs.sizes.length === 0) return []
    return prefs.sizes
      .map((size) => ({
        size,
        regions: rankedOffers
          .filter(
            (r) =>
              r.offer.is_available !== false &&
              r.offer.available_sizes_normalised?.includes(size)
          )
          .map((r) => REGION_FLAGS[r.offer.region] || r.offer.region.toUpperCase()),
      }))
      .filter((m) => m.regions.length > 0)
  }, [rankedOffers, prefs.sizes])
  const inStockRegions = rankedOffers.filter((r) => r.offer.is_available !== false).length

  useEffect(() => {
    // The server resolved both of these already. Only a render that somehow
    // arrives without them needs to go and look, which keeps this component
    // usable outside the product route.
    if (initialProduct) return
    fetchProduct()
  }, [productId, initialProduct])

  const fetchProduct = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/dropradar/products/${productId}`)
      const data = await response.json()

      if (data.success && data.data) {
        setProduct(data.data)
        fetchRelatedProducts(data.data.handle)
      }
    } catch (error) {
      console.error("Error fetching product:", error)
      // Otherwise a failed request renders the "Product not found" page, which
      // claims the listing is gone when the request simply did not complete.
      toast.error("Couldn't load this product. Check your connection.")
    } finally {
      setIsLoading(false)
    }
  }

  const fetchRelatedProducts = async (handle: string) => {
    try {
      const response = await fetch(`/api/dropradar/products/by-handle/${handle}`)
      const data = await response.json()
      if (data.success && Array.isArray(data.data)) {
        setRelatedProducts(data.data.filter((p: Product) => p.id !== productId))
      }
    } catch (error) {
      console.error("Error fetching related:", error)
      // The "Compare regions" block simply does not render without these, so
      // there is nothing on the page to say the comparison is missing.
      toast.error("Couldn't load the other regions for this product.")
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const handleWishlist = () => {
    if (!product) return
    if (isWishlisted) {
      removeItem(productId)
    } else {
      addItem({
        id: product.id,
        name: product.title,
        price: product.price,
        currency: product.currency,
        image: product.image_url,
        url: product.product_url,
        region: product.region,
        handle: product.handle,
      })
    }
  }

  const handleShare = async () => {
    // The share sheet rejects with AbortError when the user dismisses it, and
    // this was unguarded — a cancelled share became an unhandled rejection.
    // The clipboard path gave no feedback at all, so it looked like nothing
    // happened.
    try {
      if (navigator.share && product) {
        await navigator.share({ title: product.title, url: window.location.href })
        return
      }
      await navigator.clipboard.writeText(window.location.href)
      toast.success("Link copied")
    } catch (error) {
      if ((error as Error).name === "AbortError") return
      console.error("Error sharing product:", error)
      toast.error("Couldn't share this link.")
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-[13px] text-muted-foreground animate-pulse">Loading…</div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[15px] font-semibold">Product not found</p>
        <p className="text-[13px] text-muted-foreground max-w-xs">It may have been delisted, or the link is out of date.</p>
        <Link href="/shop" className="btn btn-primary">
          Back to shop
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header
        actions={
          <>
            <button onClick={handleShare} aria-label="Share" className="btn btn-ghost btn-icon">
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleWishlist}
              aria-label="Toggle wishlist"
              className={`btn btn-icon ${isWishlisted ? "btn-primary" : "btn-ghost"}`}
            >
              <Heart className={`w-4 h-4 ${isWishlisted ? "fill-current" : ""}`} />
            </button>
          </>
        }
      />

      <PriceAlertModal
        isOpen={alertModalOpen}
        onClose={() => setAlertModalOpen(false)}
        productId={product.id}
        productName={product.title}
        currentPrice={product.price}
        currency={product.currency}
      />

      <main className="pt-12 pb-nav">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-5">
          <Link href="/shop" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to shop
          </Link>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 py-8">
            <div className="aspect-[3/4] card-frame">
              {/* Hotlinked straight from the retailer's CDN, so a delisted or
                  moved asset is normal wear rather than an exception. Degrade
                  to the placeholder instead of a broken-image icon on what is
                  the most prominent image in the app. */}
              <img
                src={product.image_url || "/placeholder.svg"}
                alt={product.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const img = e.currentTarget
                  if (img.src.endsWith("/placeholder.svg")) return
                  img.src = "/placeholder.svg"
                }}
              />
            </div>

            <div className="space-y-6">
              <div>
                <p className="label mb-2">
                  {product.vendor} / {product.product_type}
                </p>
                <h1 className="display text-3xl md:text-5xl tracking-tight">{product.title}</h1>
                <hr className="hairline-signal mt-4" />
              </div>

              {/* One sentence composed entirely from data already on the page:
                  which regions stock the shopper's sizes, and where this lands
                  cheapest. Clauses with nothing behind them are dropped, not
                  guessed at. Gated on prefsReady so it never renders against
                  the pre-hydration defaults and then rewrites itself. */}
              {prefsReady && (() => {
                const joinRegions = (regions: string[]) =>
                  regions.length > 1
                    ? `${regions.slice(0, -1).join(", ")} & ${regions[regions.length - 1]}`
                    : regions[0]
                const bold = (text: string, key: string) => (
                  <strong key={key} className="font-semibold text-foreground">{text}</strong>
                )

                const clauses: React.ReactNode[] = []
                if (prefs.sizes.length > 0 && hasNormalised) {
                  if (sizeMatches.length > 0) {
                    clauses.push(
                      <span key="sizes">
                        {sizeMatches.map((m, i) => (
                          <span key={m.size}>
                            {i > 0 && ", "}
                            {bold(m.size, `s-${m.size}`)} available in {bold(joinRegions(m.regions), `r-${m.size}`)}
                          </span>
                        ))}
                      </span>
                    )
                  } else {
                    clauses.push(
                      <span key="sizes">
                        {bold(prefs.sizes.join(", "), "s-none")} not in stock in any region
                      </span>
                    )
                  }
                } else {
                  clauses.push(
                    <span key="regions">
                      In stock in {bold(String(inStockRegions), "n-in")} of{" "}
                      {bold(String(rankedOffers.length), "n-of")} region{rankedOffers.length === 1 ? "" : "s"}
                    </span>
                  )
                }
                if (best) {
                  clauses.push(
                    <span key="landed">
                      cheapest landed to {destination.code}:{" "}
                      {bold(
                        `${REGION_FLAGS[best.offer.region] || best.offer.region.toUpperCase()} ≈${formatLanded(best.landed.totalUSD, destination, fx)}`,
                        "landed"
                      )}
                    </span>
                  )
                }
                if (clauses.length === 0) return null
                return (
                  <div className="num card-frame px-4 py-3 text-[13px] text-muted-foreground">
                    {clauses.map((clause, i) => (
                      <span key={i}>
                        {i > 0 && " · "}
                        {clause}
                      </span>
                    ))}
                  </div>
                )
              })()}

              <div className="flex items-center gap-4">
                <span className="display num text-2xl">
                  {formatPrice(product.price, product.currency)}
                </span>
                {/* The struck-through figure is the highest price we have
                    recorded for this listing, not the retailer's compare_price
                    — that number is theirs to set and routinely describes a
                    price the garment never sold at. */}
                {verdict.isLow && priceStats && (
                  <span className="num text-muted-foreground line-through">
                    {formatPrice(priceStats.high, product.currency)}
                  </span>
                )}
                {verdict.label && (
                  <span className={`pill num px-2.5 py-1 text-xs font-medium ${verdict.isLow ? "bg-signal text-signal-foreground" : "bg-secondary text-foreground"}`}>
                    {verdict.label}
                  </span>
                )}
                <span
                  className={`pill px-2.5 py-1 text-xs font-medium ${product.is_available
                    ? "bg-secondary text-foreground"
                    : "bg-secondary text-muted-foreground"
                    }`}
                >
                  {product.is_available ? "In stock" : "Sold out"}
                </span>
                {left && product.is_available && (
                  <span className={`text-[13px] ${left.isLow ? "text-signal font-medium" : "text-muted-foreground"}`}>
                    {left.label}
                  </span>
                )}
              </div>

              {/* Cheapest-region callout — only worth showing if it's buyable */}
              {bestOffer?.is_available && savingsUSD >= 1 && (
                <Link
                  href={`/product/${bestOffer.id}`}
                  className="pill num inline-flex items-center gap-2 px-4 py-2 bg-signal/10 text-signal text-[13px] font-medium hover:bg-signal hover:text-signal-foreground transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Cheaper from {REGION_FLAGS[bestOffer.region] || bestOffer.region.toUpperCase()} —{" "}
                  ~{formatLanded(best!.landed.totalUSD, destination, fx)} delivered (save ≈{" "}
                  {formatLanded(savingsUSD, destination, fx)})
                </Link>
              )}

              {/* Show unique sizes only */}
              {(() => {
                const uniqueSizes = [...new Set(product.available_sizes)]
                // Check if sizes look like actual sizes (contain S, M, L, XL or numbers)
                const looksLikeSizes = uniqueSizes.some(s =>
                  /^(X?S|S|M|L|XL|XXL|\d+)$/i.test(s) || s.includes("Size")
                )
                if (uniqueSizes.length > 0 && looksLikeSizes) {
                  return (
                    <div>
                      <p className="label mb-3">
                        Available Sizes
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {uniqueSizes.map((size) => (
                          <span key={size} className="pill px-4 py-1.5 bg-secondary text-[13px]">
                            {size.replace("Size ", "")}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                } else {
                  return (
                    <div className="text-sm text-muted-foreground">
                      {product.total_variants} variants available
                    </div>
                  )
                }
              })()}

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Globe className="w-4 h-4" />
                <span>Region: {REGION_FLAGS[product.region]} ({product.currency})</span>
              </div>

              <div className="flex flex-col gap-3">
                <a
                  href={product.product_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-lg w-full"
                >
                  <ExternalLink className="w-4 h-4" />
                  Buy on Stüssy
                </a>
                <button
                  onClick={() => setAlertModalOpen(true)}
                  className="btn btn-secondary btn-lg w-full"
                >
                  <Bell className="w-4 h-4" />
                  Set price alert
                </button>
              </div>

              <div className="pt-4 border-t border-border space-y-2 text-sm text-muted-foreground">
                <p>First seen: {formatDate(product.first_seen_at)}</p>
                <p>Last updated: {formatDate(product.last_seen_at)}</p>
              </div>

              {/* Only show user-friendly tags (filter out internal codes) */}
              {(() => {
                const cleanTags = product.tags
                  .filter(tag =>
                    !tag.includes("DELIVERY") &&
                    !tag.includes("UPLOAD") &&
                    !tag.includes("RESHOOT") &&
                    !tag.match(/^\d+N?$/) &&
                    !tag.includes("Size Guide")
                  )
                  .slice(0, 4)
                return cleanTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {cleanTags.map((tag) => (
                      <span key={tag} className="pill px-2.5 py-1 bg-secondary text-[11px] text-muted-foreground capitalize">
                        {tag.toLowerCase().replace(/-/g, " ")}
                      </span>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>

          <section className="section">
            <div className="section-head">
              <h2 className="label">Price history</h2>
            </div>
            <div className="max-w-2xl">
              <PriceHistoryChart productId={productId} currency={product.currency} />
            </div>
          </section>

          {localRegion !== null && !stockedLocally && (
            <section className="section">
              <div className="section-head">
                <h2 className="label">Availability</h2>
              </div>
              {/* An interruption card, so it keeps bg-secondary rather than
                  taking a frame like the content plates. */}
              <RegionAlertCard
                styleCode={product.style_code || product.handle}
                region={localRegion}
                regionName={destination.name}
                title={product.title}
                imageUrl={product.image_url}
                stockedIn={stockedRegions}
              />
            </section>
          )}

          {rankedOffers.length > 1 && (
            <>
            <SelloutVelocity styleCode={product.style_code || product.handle} />

            <SizeAvailability
              offers={rankedOffers.map(({ offer, landed }) => ({
                id: offer.id,
                region: offer.region,
                all_sizes: offer.all_sizes,
                available_sizes: offer.available_sizes,
                all_sizes_normalised: offer.all_sizes_normalised,
                available_sizes_normalised: offer.available_sizes_normalised,
                is_available: offer.is_available,
                deliverability: landed.deliverability,
              }))}
              destination={destination}
              currentRegion={product.region}
            />

            <section className="section">
              <div className="section-head flex-wrap items-center">
                <h2 className="label">Compare regions</h2>
                <DestinationSelect value={destination.code} onChange={setDestination} />
              </div>
              <p className="text-xs text-muted-foreground mb-6">
                Ranked by estimated cost delivered to {destination.name}, including shipping and
                duty. Estimates only — customs assess the final amount.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {rankedOffers.map(({ offer: p, landed }) => {
                  const isCurrent = p.id === product.id
                  const isBest = bestOffer && p.id === bestOffer.id
                  const cost = toDisplayCost(landed, destination, fx)
                  const undeliverable = landed.deliverability !== "ships"
                  return (
                    <Link
                      key={p.id}
                      href={isCurrent ? "#" : `/product/${p.id}`}
                      // The best card keeps its own rounding: card-frame clips
                      // overflow, and its "Best delivered" pill overhangs the top
                      // edge.
                      className={`card-lift relative p-4 ${
                        isBest ? "rounded-2xl bg-primary text-primary-foreground" : "card-frame"
                      } ${p.is_available === false ? "opacity-55" : ""}`}
                    >
                      {isBest && (
                        <span className="pill absolute -top-2.5 left-3 bg-signal text-signal-foreground px-2.5 py-0.5 text-[10px] font-semibold">
                          Best delivered
                        </span>
                      )}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold">{REGION_FLAGS[p.region] || p.region.toUpperCase()}</span>
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            p.is_available ? "bg-green-500" : isBest ? "bg-primary-foreground/40" : "bg-muted-foreground/40"
                          }`}
                        />
                      </div>

                      {/* A store that will not ship here has no delivered cost,
                          so it shows the shelf price and says why there is no
                          total. Ranking it on an invented total put "cheapest"
                          on orders that cannot be placed. */}
                      {undeliverable ? (
                        <>
                          <p className="num text-[15px] font-semibold">{formatPrice(p.price, p.currency)}</p>
                          <p className={`text-[11px] ${isBest ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                            in store{isCurrent ? " · viewing" : ""}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="num text-[15px] font-semibold">~{formatDisplay(cost.total, cost)}</p>
                          <p className={`text-[11px] ${isBest ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                            delivered{isCurrent ? " · viewing" : ""}
                          </p>
                        </>
                      )}

                      {/* Every row here is in the destination's currency, so the
                          column adds up to the total above it. The store's own
                          price is a separate line rather than the Item row: it
                          is what gets charged at checkout, which is worth
                          knowing, but it is not a term in this sum. */}
                      <div className={`num mt-2.5 pt-2.5 space-y-0.5 text-[11px] border-t ${isBest ? "border-primary-foreground/15 text-primary-foreground/60" : "border-border text-muted-foreground"}`}>
                        {undeliverable ? (
                          <div>{landed.notes}</div>
                        ) : (
                          <>
                            <div className="flex justify-between gap-2">
                              <span>Item</span>
                              <span>~{formatDisplay(cost.item, cost)}</span>
                            </div>
                            {cost.shipping > 0 && (
                              <div className="flex justify-between gap-2">
                                <span>Shipping{landed.shippingIsEstimated ? "*" : ""}</span>
                                <span>~{formatDisplay(cost.shipping, cost)}</span>
                              </div>
                            )}
                            {cost.shipping === 0 && <div>Free shipping</div>}
                            {cost.duty > 0 && (
                              <div className="flex justify-between gap-2">
                                <span>Duty &amp; tax</span>
                                <span>~{formatDisplay(cost.duty, cost)}</span>
                              </div>
                            )}
                            {landed.isCleanEstimate && !landed.isDomestic && <div>Duty paid at checkout</div>}
                            {landed.isDomestic && <div>Domestic</div>}
                          </>
                        )}
                        {p.currency !== destination.currency && (
                          <div className={`flex justify-between gap-2 pt-1 mt-1 border-t ${isBest ? "border-primary-foreground/15" : "border-border"}`}>
                            <span>Pay at store</span>
                            <span>{formatPrice(p.price, p.currency)}</span>
                          </div>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>

              <p className="text-[11px] text-muted-foreground mt-4 max-w-xl">
                Shipping is each store&apos;s own published rate for this destination. Duty and tax
                are estimated and are not a quote — the final amount is assessed by customs when
                the parcel clears.
              </p>
            </section>
            </>
          )}

          {/* Clearance for the fixed action bar below — pb-nav only clears the
              bottom nav, and the bar stacks on top of that. */}
          <div className="h-16 md:hidden" aria-hidden="true" />
        </div>
      </main>

      {/* Mobile action bar. Sits directly on top of the bottom nav, which is
          h-14 (3.5rem) plus the home indicator — see the nav in
          components/layout/header.tsx and .pb-nav in globals.css. z-40 keeps
          it under the nav (z-50) so the nav's blur stays on top of scrolled
          content, not under this bar's. */}
      <div className="md:hidden fixed left-0 right-0 z-40 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] bg-background/90 backdrop-blur-xl border-t border-border">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="num text-[15px] font-semibold truncate">
              {displayPrice(product.price, product.currency)}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {REGION_FLAGS[product.region] || product.region.toUpperCase()} ·{" "}
              {product.is_available ? "In stock" : "Sold out"}
            </p>
          </div>
          {/* w-10! because .btn-icon's unlayered 2rem would outrank the layered
              width utility — and 32px is too small a thumb target down here. */}
          <button
            onClick={handleWishlist}
            aria-label="Toggle wishlist"
            className={`btn btn-icon w-10! h-10! shrink-0 ${
              isWishlisted ? "btn-primary" : "btn-secondary"
            }`}
          >
            <Heart className={`w-4 h-4 ${isWishlisted ? "fill-current" : ""}`} />
          </button>
          <a
            href={product.product_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary shrink-0"
          >
            <ExternalLink className="w-4 h-4" />
            Open store
          </a>
        </div>
      </div>
    </div>
  )
}

export default function ProductDetail(props: ProductDetailProps) {
  return <ProductDetailContent {...props} />
}
