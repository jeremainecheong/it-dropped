"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { TrendingUp, Heart, Eye } from "lucide-react"
import { toast } from "sonner"
import { ImageWithLoading } from "@/components/image-with-loading"
import { useWishlist } from "@/lib/wishlist-context"

interface Product {
    id: string
    /** Present on the trending payload (PRODUCT_COLUMNS); optional here because
     *  a save must still work without it — the context falls back to the
     *  product id as the handle, which is how every legacy row was written. */
    handle?: string
    title: string
    price: number
    currency: string
    image_url: string
    product_url?: string
    region: string
    is_available: boolean
}

interface TrendingProductsProps {
    limit?: number
    title?: string
}

const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: "$",
    GBP: "£",
    EUR: "€",
    JPY: "¥",
    AUD: "A$",
    SGD: "S$",
}

export function TrendingProducts({ limit = 8, title = "Trending" }: TrendingProductsProps) {
    const [products, setProducts] = useState<Product[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const { addItem, removeItem, isInWishlist } = useWishlist()

    useEffect(() => {
        fetchTrending()
    }, [limit])

    const fetchTrending = async () => {
        try {
            const response = await fetch(`/api/dropradar/trending?limit=${limit}`)
            const data = await response.json()
            if (data.success && Array.isArray(data.data)) {
                setProducts(data.data)
            }
        } catch (error) {
            console.error("Error fetching trending:", error)
            // The component renders nothing when products is empty, so a failed
            // fetch was indistinguishable from an empty catalogue.
            toast.error("Couldn't load trending products.")
        } finally {
            setIsLoading(false)
        }
    }

    const formatPrice = (price: number, currency: string) => {
        const symbol = CURRENCY_SYMBOLS[currency] || currency
        return `${symbol}${price.toFixed(currency === "JPY" ? 0 : 2)}`
    }

    // Defer to the context, which also resolves saves written before
    // product_id was populated and stored under the handle column.
    const isWishlisted = isInWishlist

    const handleWishlist = (product: Product, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (isWishlisted(product.id)) {
            removeItem(product.id)
        } else {
            addItem({
                id: product.id,
                name: product.title,
                price: product.price,
                currency: product.currency,
                image: product.image_url,
                // The store link, so /wishlist can offer "buy" as well as the
                // product page. Falls back to the internal route, which is what
                // this always stored.
                url: product.product_url || `/product/${product.id}`,
                region: product.region,
                handle: product.handle,
            })
        }
    }

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-sm uppercase tracking-widest">{title}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Array.from({ length: limit }).map((_, i) => (
                        <div key={i} className="animate-pulse">
                            <div className="aspect-[3/4] bg-muted mb-2" />
                            <div className="h-4 bg-muted w-3/4 mb-1" />
                            <div className="h-3 bg-muted w-1/2" />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    if (products.length === 0) {
        return null
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-sm uppercase tracking-widest">{title}</span>
                </div>
                <Link href="/shop" className="text-xs text-muted-foreground hover:text-foreground">
                    View All
                </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {products.map((product) => (
                    <div key={product.id} className="group relative">
                        <Link href={`/product/${product.id}`}>
                            <div className="aspect-[3/4] bg-muted mb-2 overflow-hidden relative">
                                <ImageWithLoading
                                    src={product.image_url}
                                    alt={product.title}
                                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                />
                                {!product.is_available && (
                                    <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                                        <span className="text-xs uppercase tracking-widest">Sold Out</span>
                                    </div>
                                )}
                                <span className="absolute top-2 left-2 px-2 py-0.5 bg-background text-foreground text-[10px] uppercase">
                                    {product.region}
                                </span>
                            </div>
                            <h3 className="text-xs uppercase tracking-wide line-clamp-1 mb-0.5">
                                {product.title}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                {formatPrice(product.price, product.currency)}
                            </p>
                        </Link>
                        <button
                            onClick={(e) => handleWishlist(product, e)}
                            className={`absolute top-2 right-2 p-2 rounded transition-all opacity-0 group-hover:opacity-100 ${isWishlisted(product.id)
                                    ? "bg-foreground text-background"
                                    : "bg-background/80 hover:bg-foreground hover:text-background"
                                }`}
                        >
                            <Heart className={`w-4 h-4 ${isWishlisted(product.id) ? "fill-current" : ""}`} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    )
}
