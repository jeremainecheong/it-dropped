"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Check, X } from "lucide-react"
import { Header } from "@/components/layout/header"
import { formatPrice } from "@/lib/currency"
import { rankByLandedCost, formatDisplay, toDisplayCost } from "@/lib/landed-cost"
import { useDestination } from "@/lib/use-destination"
import { useFx } from "@/lib/use-fx"
import { DestinationSelect } from "@/components/ui/destination-select"

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
    const { destination, setDestination } = useDestination()
    const { rates: fx } = useFx()

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
                setProducts(data.data)
            }
        } catch (error) {
            console.error("Error:", error)
        } finally {
            setIsLoading(false)
        }
    }

    // Ranked by estimated delivered cost — sticker price alone is misleading
    // once shipping and duty enter the picture.
    const ranked = rankByLandedCost(products, destination, fx)
    // Cheapest has to be buyable: in stock AND from a store that ships here.
    const cheapest =
        ranked.find((r) => r.offer.is_available && r.landed.deliverability === "ships")?.offer ?? null

    if (!handle) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
                <p className="text-[15px] font-semibold">No product to compare</p>
                <p className="text-[13px] text-muted-foreground max-w-xs">Pick a product from the shop to see its price in every region.</p>
                <Link href="/shop" className="pill px-5 py-2.5 bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-85">
                    Browse shop
                </Link>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Header />

            <main className="pt-12 pb-nav">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="text-[13px] text-muted-foreground animate-pulse">Loading…</div>
                        </div>
                    ) : products.length === 0 ? (
                        <div className="text-center py-20">
                            <p className="text-[13px] text-muted-foreground">No products found</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                                <div>
                                    <h1 className="display text-2xl md:text-3xl">{products[0].title}</h1>
                                    <p className="text-[13px] text-muted-foreground mt-1">{products[0].vendor}</p>
                                </div>
                                <DestinationSelect value={destination.code} onChange={setDestination} />
                            </div>
                            <p className="text-xs text-muted-foreground mb-8 max-w-xl">
                                Ranked by estimated cost delivered to {destination.name}. Shipping and duty are
                                estimates, not a quote — customs assess the final amount.
                            </p>

                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {ranked.map(({ offer: product, landed }) => {
                                    const isCheapest = cheapest && product.id === cheapest.id
                                    const cost = toDisplayCost(landed, destination, fx)
                                    const undeliverable = landed.deliverability !== "ships"
                                    return (
                                        <div
                                            key={product.id}
                                            className={`card-lift rounded-2xl p-6 ${isCheapest ? "bg-primary text-primary-foreground" : "bg-secondary"
                                                }`}
                                        >
                                            {isCheapest && (
                                                <span className="pill inline-block bg-signal text-signal-foreground px-2.5 py-0.5 text-[10px] font-semibold mb-4">
                                                    Best delivered
                                                </span>
                                            )}

                                            <div className="flex items-center gap-3 mb-4">
                                                <span className="text-[15px] font-semibold">
                                                    {product.region.toUpperCase()}
                                                </span>
                                                <span className={`text-[13px] ${isCheapest ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                                    {REGION_NAMES[product.region]}
                                                </span>
                                            </div>

                                            <div className="mb-4">
                                                <div className="display text-3xl">
                                                    {undeliverable ? formatPrice(product.price, product.currency) : `~${formatDisplay(cost.total, cost)}`}
                                                </div>
                                                <div className={`text-xs mt-1 ${isCheapest ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                                    {undeliverable ? "in store" : `delivered to ${destination.name}`}
                                                </div>
                                            </div>

                                            {/* One currency per column of figures: the item line used to be the
                                                store's own, so the breakdown did not sum to the total above it. */}
                                            <div className={`mb-4 space-y-0.5 text-xs ${isCheapest ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                                {!undeliverable && (
                                                <div className="flex justify-between">
                                                    <span>Item</span><span>~{formatDisplay(cost.item, cost)}</span>
                                                </div>
                                                )}
                                                {cost.shipping > 0 && (
                                                    <div className="flex justify-between">
                                                        <span>Shipping</span><span>~{formatDisplay(cost.shipping, cost)}</span>
                                                    </div>
                                                )}
                                                {cost.duty > 0 && (
                                                    <div className="flex justify-between">
                                                        <span>Duty &amp; tax</span><span>~{formatDisplay(cost.duty, cost)}</span>
                                                    </div>
                                                )}
                                                {product.currency !== destination.currency && (
                                                    <div className="flex justify-between">
                                                        <span>Pay at store</span><span>{formatPrice(product.price, product.currency)}</span>
                                                    </div>
                                                )}
                                                <div>{landed.notes}</div>
                                            </div>

                                            <div className="flex items-center gap-2 mb-4">
                                                {product.is_available ? (
                                                    <>
                                                        <Check className="w-3.5 h-3.5" />
                                                        <span className="text-[13px]">In stock</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <X className="w-3.5 h-3.5 opacity-50" />
                                                        <span className={`text-[13px] ${isCheapest ? "text-primary-foreground/60" : "text-muted-foreground"}`}>Sold out</span>
                                                    </>
                                                )}
                                            </div>

                                            <div className={`text-xs mb-4 ${isCheapest ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                                {product.available_sizes.length} sizes available
                                            </div>

                                            <div className="flex flex-wrap gap-1 mb-6">
                                                {product.available_sizes.slice(0, 8).map((size) => (
                                                    <span
                                                        key={size}
                                                        className={`pill px-2.5 py-0.5 text-xs ${isCheapest ? "bg-primary-foreground/15" : "bg-background"}`}
                                                    >
                                                        {size}
                                                    </span>
                                                ))}
                                                {product.available_sizes.length > 8 && (
                                                    <span className="px-2 py-0.5 text-xs opacity-60">
                                                        +{product.available_sizes.length - 8}
                                                    </span>
                                                )}
                                            </div>

                                            <a
                                                href={product.product_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`pill flex items-center justify-center gap-2 w-full py-3 text-[13px] font-medium ${isCheapest ? "bg-primary-foreground text-primary hover:opacity-90" : "bg-primary text-primary-foreground hover:opacity-85"}`}
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
                    <CompareContent />
    )
}
