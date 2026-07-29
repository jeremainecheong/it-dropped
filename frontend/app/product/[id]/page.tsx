"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Heart, ExternalLink, Share2, Bell, Check, Globe } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useWishlist } from "@/lib/wishlist-context"
import { AuthGuard } from "@/components/auth-guard"
import { Header } from "@/components/layout/header"
import { PriceHistoryChart } from "@/components/product/price-history-chart"
import { formatPrice, toUSD, rankByUSD, bestOffer as pickBestOffer } from "@/lib/currency"

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
  total_variants: number
  image_url: string
  product_url: string
  first_seen_at: string
  last_seen_at: string
}

const REGION_FLAGS: Record<string, string> = {
  us: "US",
  uk: "UK",
  eu: "EU",
  jp: "JP",
  au: "AU",
  sg: "SG",
}

function ProductDetailContent() {
  const params = useParams()
  const productId = params.id as string
  const { user } = useAuth()
  const { items: wishlist, addItem, removeItem } = useWishlist()

  const [product, setProduct] = useState<Product | null>(null)
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [alertSet, setAlertSet] = useState(false)

  const isWishlisted = wishlist.some((item) => item.id === productId)

  // All regional offers for this product, ranked by approximate USD value
  const regionOffers = useMemo(
    () => (product ? rankByUSD([product, ...relatedProducts]) : []),
    [product, relatedProducts]
  )

  const bestOffer = useMemo(
    () => (product ? pickBestOffer([product, ...relatedProducts]) : undefined),
    [product, relatedProducts]
  )
  const savingsUSD =
    product && bestOffer && bestOffer.region !== product.region
      ? toUSD(product.price, product.currency) - bestOffer.usd
      : 0

  useEffect(() => {
    fetchProduct()
  }, [productId])

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
      })
    }
  }

  const handleShare = async () => {
    if (navigator.share && product) {
      await navigator.share({
        title: product.title,
        url: window.location.href,
      })
    } else {
      navigator.clipboard.writeText(window.location.href)
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
        <Link href="/shop" className="pill px-5 py-2.5 bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-85">
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
            <button onClick={handleShare} aria-label="Share" className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground transition-colors">
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleWishlist}
              aria-label="Toggle wishlist"
              className={`pill flex items-center justify-center w-8 h-8 transition-colors ${isWishlisted ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Heart className={`w-4 h-4 ${isWishlisted ? "fill-current" : ""}`} />
            </button>
          </>
        }
      />

      <main className="pt-12 pb-20 md:pb-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-5">
          <Link href="/shop" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to shop
          </Link>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 py-8">
            <div className="aspect-[3/4] bg-secondary rounded-3xl overflow-hidden">
              <img
                src={product.image_url}
                alt={product.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="space-y-6">
              <div>
                <p className="label mb-2">
                  {product.vendor} / {product.product_type}
                </p>
                <h1 className="display text-2xl lg:text-3xl">{product.title}</h1>
              </div>

              <div className="flex items-center gap-4">
                <span className="display text-2xl">
                  {formatPrice(product.price, product.currency)}
                </span>
                {product.compare_price && product.compare_price > product.price && (
                  <span className="text-muted-foreground line-through">
                    {formatPrice(product.compare_price, product.currency)}
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
              </div>

              {/* Cheapest-region callout — only worth showing if it's buyable */}
              {bestOffer?.is_available && savingsUSD >= 1 && (
                <Link
                  href={`/product/${bestOffer.id}`}
                  className="pill inline-flex items-center gap-2 px-4 py-2 bg-signal/10 text-signal text-[13px] font-medium hover:bg-signal hover:text-signal-foreground transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Cheaper in {REGION_FLAGS[bestOffer.region] || bestOffer.region.toUpperCase()} —{" "}
                  {formatPrice(bestOffer.price, bestOffer.currency)} (save ≈ ${Math.round(savingsUSD)})
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
                  className="pill flex items-center justify-center gap-2 w-full py-3.5 bg-primary text-primary-foreground text-sm font-medium hover:opacity-85"
                >
                  <ExternalLink className="w-4 h-4" />
                  Buy on Stüssy
                </a>
                <button
                  onClick={() => setAlertSet(!alertSet)}
                  className={`pill flex items-center justify-center gap-2 w-full py-3.5 text-sm font-medium ${alertSet
                    ? "bg-secondary text-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                >
                  {alertSet ? <Check className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                  {alertSet ? "Alert set" : "Set price alert"}
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

          <div className="py-8 border-t border-border">
            <h2 className="label mb-6">
              Price History
            </h2>
            <div className="max-w-2xl">
              <PriceHistoryChart productId={productId} currency={product.currency} />
            </div>
          </div>

          {regionOffers.length > 1 && (
            <div className="py-8 border-t border-border">
              <div className="flex items-baseline justify-between mb-6">
                <h2 className="label">Compare regions</h2>
                <span className="text-xs text-muted-foreground">ranked by ≈ USD value</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {regionOffers.map((p, i) => {
                  const isCurrent = p.region === product.region
                  const isBest = bestOffer && p.id === bestOffer.id
                  return (
                    <Link
                      key={p.id}
                      href={isCurrent ? "#" : `/product/${p.id}`}
                      className={`card-lift relative rounded-2xl p-4 ${
                        isBest ? "bg-primary text-primary-foreground" : "bg-secondary"
                      } ${!p.is_available ? "opacity-55" : ""}`}
                    >
                      {isBest && (
                        <span className="pill absolute -top-2.5 left-3 bg-signal text-signal-foreground px-2.5 py-0.5 text-[10px] font-semibold">
                          Best price
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
                      <p className="text-[15px] font-semibold">{formatPrice(p.price, p.currency)}</p>
                      <p className={`text-[11px] mt-0.5 ${isBest ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        ≈ ${Math.round(p.usd)}{isCurrent ? " · viewing" : ""}
                      </p>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function ProductDetailPage() {
  return (
    <AuthGuard>
      <ProductDetailContent />
    </AuthGuard>
  )
}
