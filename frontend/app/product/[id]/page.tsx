"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Heart, ExternalLink, Share2, Bell, Check, Globe } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useWishlist } from "@/lib/wishlist-context"
import { AuthGuard } from "@/components/auth-guard"
import { Header } from "@/components/layout/header"
import { PriceHistoryChart } from "@/components/product/price-history-chart"

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

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  JPY: "¥",
  AUD: "A$",
  SGD: "S$",
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

  const formatPrice = (price: number, currency: string) => {
    const symbol = CURRENCY_SYMBOLS[currency] || currency
    return `${symbol}${price.toFixed(currency === "JPY" ? 0 : 2)}`
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
        <div className="text-sm uppercase tracking-widest text-muted-foreground animate-pulse">
          Loading...
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Product not found</p>
        <Link href="/shop" className="text-sm underline">
          Back to Shop
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
        <div className="max-w-6xl mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 py-8">
            <div className="aspect-[3/4] bg-muted overflow-hidden">
              <img
                src={product.image_url}
                alt={product.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="space-y-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                  {product.vendor} / {product.product_type}
                </p>
                <h1 className="text-2xl lg:text-3xl font-medium">{product.title}</h1>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-2xl font-medium">
                  {formatPrice(product.price, product.currency)}
                </span>
                {product.compare_price && product.compare_price > product.price && (
                  <span className="text-muted-foreground line-through">
                    {formatPrice(product.compare_price, product.currency)}
                  </span>
                )}
                <span
                  className={`px-2 py-1 text-xs uppercase tracking-wide ${product.is_available
                    ? "bg-green-500/10 text-green-600"
                    : "bg-red-500/10 text-red-600"
                    }`}
                >
                  {product.is_available ? "In Stock" : "Sold Out"}
                </span>
              </div>

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
                      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
                        Available Sizes
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {uniqueSizes.map((size) => (
                          <span key={size} className="px-3 py-2 border border-border text-sm">
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
                  className="flex items-center justify-center gap-2 w-full py-4 bg-foreground text-background text-sm uppercase tracking-wide font-medium hover:bg-foreground/90 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Buy on Stussy
                </a>
                <button
                  onClick={() => setAlertSet(!alertSet)}
                  className={`flex items-center justify-center gap-2 w-full py-4 border text-sm uppercase tracking-wide transition-colors ${alertSet
                    ? "border-foreground bg-foreground/5"
                    : "border-border hover:border-foreground"
                    }`}
                >
                  {alertSet ? <Check className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                  {alertSet ? "Alert Set" : "Set Price Alert"}
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
                      <span key={tag} className="px-2 py-1 bg-muted text-xs text-muted-foreground capitalize">
                        {tag.toLowerCase().replace(/-/g, " ")}
                      </span>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>

          <div className="py-8 border-t border-border">
            <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-6">
              Price History
            </h2>
            <div className="max-w-2xl">
              <PriceHistoryChart productId={productId} currency={product.currency} />
            </div>
          </div>

          {relatedProducts.length > 0 && (
            <div className="py-8 border-t border-border">
              <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-6">
                Compare Prices Across Regions
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {relatedProducts.map((p) => (
                  <Link
                    key={p.id}
                    href={`/product/${p.id}`}
                    className="border border-border p-4 hover:border-foreground/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium">{REGION_FLAGS[p.region]}</span>
                      <span className={`w-2 h-2 rounded-full ${p.is_available ? "bg-green-500" : "bg-red-500"}`} />
                    </div>
                    <p className="text-lg font-medium">{formatPrice(p.price, p.currency)}</p>
                    <p className="text-xs text-muted-foreground">{p.available_sizes.length} sizes</p>
                  </Link>
                ))}
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
