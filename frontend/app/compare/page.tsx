"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Check, X } from "lucide-react"
import { AuthGuard } from "@/components/auth-guard"
import { Header } from "@/components/layout/header"

interface Product {
    id: string
    region: string
    handle: string
    title: string
    vendor: string
    price: number
    currency: string
    is_available: boolean
    available_sizes: string[]
    image_url: string
    product_url: string
}

const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: "$",
    GBP: "£",
    EUR: "€",
    JPY: "¥",
    AUD: "A$",
    SGD: "S$",
}

const REGION_NAMES: Record<string, string> = {
    us: "United States",
    uk: "United Kingdom",
    eu: "Europe",
    jp: "Japan",
    au: "Australia",
    sg: "Singapore",
}

function CompareContent() {
    const searchParams = useSearchParams()
    const handle = searchParams.get("handle")

    const [products, setProducts] = useState<Product[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (handle) {
            fetchProducts(handle)
        }
    }, [handle])

    const fetchProducts = async (productHandle: string) => {
        try {
            setIsLoading(true)
            const response = await fetch(`/api/dropradar/products/by-handle/${productHandle}`)
            const data = await response.json()
            if (data.success && Array.isArray(data.data)) {
                // Sort by price (lowest first)
                const sorted = data.data.sort((a: Product, b: Product) => a.price - b.price)
                setProducts(sorted)
            }
        } catch (error) {
            console.error("Error:", error)
        } finally {
            setIsLoading(false)
        }
    }

    const formatPrice = (price: number, currency: string) => {
        const symbol = CURRENCY_SYMBOLS[currency] || currency
        return `${symbol}${price.toFixed(currency === "JPY" ? 0 : 2)}`
    }

    // Find cheapest
    const cheapest = products.length > 0
        ? products.reduce((min, p) => (p.price < min.price ? p : min), products[0])
        : null

    if (!handle) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
                <p className="text-muted-foreground">No product to compare</p>
                <Link href="/shop" className="text-sm underline">
                    Browse Shop
                </Link>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Header />

            <main className="pt-14 pb-20 md:pb-8">
                <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="text-sm uppercase tracking-widest text-muted-foreground animate-pulse">
                                Loading...
                            </div>
                        </div>
                    ) : products.length === 0 ? (
                        <div className="text-center py-20">
                            <p className="text-muted-foreground">No products found</p>
                        </div>
                    ) : (
                        <>
                            <div className="mb-8">
                                <h1 className="text-2xl font-medium">{products[0].title}</h1>
                                <p className="text-muted-foreground text-sm mt-1">{products[0].vendor}</p>
                            </div>

                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {products.map((product) => {
                                    const isCheapest = cheapest && product.id === cheapest.id
                                    return (
                                        <div
                                            key={product.id}
                                            className={`border p-6 transition-colors ${isCheapest ? "border-green-500 bg-green-500/5" : "border-border"
                                                }`}
                                        >
                                            {isCheapest && (
                                                <div className="text-xs uppercase tracking-widest text-green-600 mb-4">
                                                    Best Price
                                                </div>
                                            )}

                                            <div className="flex items-center gap-3 mb-4">
                                                <span className="text-lg font-medium">
                                                    {product.region.toUpperCase()}
                                                </span>
                                                <span className="text-sm text-muted-foreground">
                                                    {REGION_NAMES[product.region]}
                                                </span>
                                            </div>

                                            <div className="text-3xl font-medium mb-4">
                                                {formatPrice(product.price, product.currency)}
                                            </div>

                                            <div className="flex items-center gap-2 mb-4">
                                                {product.is_available ? (
                                                    <>
                                                        <Check className="w-4 h-4 text-green-500" />
                                                        <span className="text-sm text-green-600">In Stock</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <X className="w-4 h-4 text-red-500" />
                                                        <span className="text-sm text-red-600">Sold Out</span>
                                                    </>
                                                )}
                                            </div>

                                            <div className="text-xs text-muted-foreground mb-4">
                                                {product.available_sizes.length} sizes available
                                            </div>

                                            <div className="flex flex-wrap gap-1 mb-6">
                                                {product.available_sizes.slice(0, 8).map((size) => (
                                                    <span
                                                        key={size}
                                                        className="px-2 py-1 border border-border text-xs"
                                                    >
                                                        {size}
                                                    </span>
                                                ))}
                                                {product.available_sizes.length > 8 && (
                                                    <span className="px-2 py-1 text-xs text-muted-foreground">
                                                        +{product.available_sizes.length - 8}
                                                    </span>
                                                )}
                                            </div>

                                            <a
                                                href={product.product_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center justify-center gap-2 w-full py-3 bg-foreground text-background text-sm uppercase tracking-wide hover:bg-foreground/90 transition-colors"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                                Buy
                                            </a>
                                        </div>
                                    )
                                })}
                            </div>
                        </>
                    )}
                </div>
            </main>
        </div>
    )
}

export default function ComparePage() {
    return (
        <AuthGuard>
            <CompareContent />
        </AuthGuard>
    )
}
