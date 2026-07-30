"use client"

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Heart, ChevronDown, ChevronRight, X, Menu, Clock, Package, Globe, Filter } from "lucide-react"
import { ImageWithLoading } from "@/components/image-with-loading"
import { useAuth } from "@/lib/auth-context"
import { useWishlist } from "@/lib/wishlist-context"
import { Header } from "@/components/layout/header"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { usePriceStatsBulk, priceVerdict } from "@/lib/use-price-stats"
import { scarcity } from "@/lib/scarcity"

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
    available_variants: number
    image_url: string
    product_url: string
    first_seen_at: string
    last_seen_at: string
}

const REGIONS = [
    { code: "all", name: "All Regions" },
    { code: "us", name: "United States" },
    { code: "uk", name: "United Kingdom" },
    { code: "eu", name: "Europe" },
    { code: "jp", name: "Japan" },
    { code: "au", name: "Australia" },
    { code: "sg", name: "Singapore" },
]

// Category groupings - maps user-friendly labels to raw product_type values
const CATEGORY_GROUPS: Record<string, Record<string, string[]>> = {
    "Tops": {
        "T-Shirts": ["Mens Short Sleeve T-Shirt", "Mens Long Sleeve T-Shirt", "TEES"],
        "Shirts": ["Mens Short Sleeve Shirt", "Mens Long Sleeve Shirt", "SHIRTS"],
        "Knitwear": ["Mens Short Sleeve Knit", "Mens Long Sleeve Knit", "KNIT TOPS"],
        "Sweaters": ["Mens Long Sleeve Sweater", "SWEATERS"],
        "Sweatshirts": ["Mens Long Sleeve Sweatshirt", "HOODIE"],
    },
    "Bottoms": {
        "Pants": ["Mens Pant", "Mens Regular Pant", "PANTS", "Jeans"],
        "Shorts": ["Mens Short", "Mens Swim Bottom"],
        "Sweatpants": ["Mens Sweatpant"],
    },
    "Outerwear": {
        "Jackets": ["Mens Long Sleeve Outerwear", "JACKETS"],
        "Vests": ["Mens Sleeveless Outerwear", "VESTS"],
    },
    "Headwear": {
        "Caps": ["Accessories Ball Cap"],
        "Beanies": ["Accessories Beanie", "Accessories Not Applicable Beanie"],
        "Bucket Hats": ["Accessories Bucket Hat", "Accessories - Bucket Hat", "HATS"],
    },
    "Accessories": {
        "Bags": ["Accessories Backpack", "Accessories Shoulder Bag", "Accessories Side Bag", "Accessories Tote Bag", "BACKPACKS"],
        "Belts": ["Accessories Belt", "Accessories Belts", "Accessories Not Applicable Belts", "BELTS"],
        "Wallets": ["Accessories Wallet"],
        "Eyewear": ["Accessories Sunglasses", "EYEWEAR"],
        "Other": ["Accessories Bottle", "Accessories Brief", "Accessories Key Chain", "Accessories Necktie", "Accessories Novelty Home", "Accessories Socks", "Accessories Not Applicable Key Chain"],
    },
    "Footwear": {
        "Shoes": ["Mens Shoes", "SNEAKERS"],
    },
}

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "28", "30", "32", "34", "36", "38"]

function ShopPageContent() {
    const searchParams = useSearchParams()
    const { user, logout } = useAuth()
    const { addItem, removeItem, isInWishlist } = useWishlist()

    const [products, setProducts] = useState<Product[]>([])
    // What each listing has actually cost, for the whole grid in one call.
    // Per-card would be one request per badge, which is a poor trade for a badge.
    const priceStats = usePriceStatsBulk(useMemo(() => products.map((p) => p.id), [products]))
    const [selectedRegion, setSelectedRegion] = useState(searchParams.get("region") || "all")
    const [selectedProductTypes, setSelectedProductTypes] = useState<string[]>([])
    const [selectedCategoryLabel, setSelectedCategoryLabel] = useState<string | null>(null)
    const [selectedSize, setSelectedSize] = useState<string | null>(null)
    const [inStockOnly, setInStockOnly] = useState(false)
    const [sortBy, setSortBy] = useState<"newest" | "price_asc" | "price_desc">("newest")
    const [compareMode, setCompareMode] = useState(false)
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Tops"]))

    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [isPageLoaded, setIsPageLoaded] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [totalProducts, setTotalProducts] = useState(0)

    const [offset, setOffset] = useState(0)
    const [hasMore, setHasMore] = useState(true)
    const LIMIT = 24

    // Monotonic id so a slow response from an earlier filter state can never
    // overwrite the results of a newer one.
    const requestSeq = useRef(0)

    useEffect(() => {
        setIsPageLoaded(true)
        fetchProducts(0, true)
    }, [])

    useEffect(() => {
        setOffset(0)
        setProducts([])
        setHasMore(true)
        fetchProducts(0, true)
    }, [selectedRegion, selectedProductTypes, selectedSize, inStockOnly, sortBy])

    const fetchProducts = async (currentOffset: number, reset = false) => {
        const seq = ++requestSeq.current
        if (reset) setIsLoading(true)
        else setIsLoadingMore(true)

        try {
            let url = `/api/dropradar/products?limit=${LIMIT}&offset=${currentOffset}`

            if (selectedRegion !== "all") {
                url += `&region=${selectedRegion}`
            }

            if (selectedProductTypes.length > 0) {
                // Pass multiple product types as comma-separated
                url += `&product_type=${encodeURIComponent(selectedProductTypes.join(","))}`
            }

            if (selectedSize) {
                url += `&size=${encodeURIComponent(selectedSize)}`
            }

            if (inStockOnly) {
                url += `&available=true`
            }

            url += `&sort=${sortBy}`

            const response = await fetch(url)
            const data = await response.json()

            if (seq !== requestSeq.current) return // superseded by a newer request

            if (data.success && Array.isArray(data.data)) {
                if (reset) {
                    setProducts(data.data)
                } else {
                    setProducts((prev) => [...prev, ...data.data])
                }
                setHasMore(data.data.length === LIMIT)
                setOffset(currentOffset + LIMIT)
                if (data.meta?.total) {
                    setTotalProducts(data.meta.total)
                }
            }
        } catch (error) {
            console.error("Error:", error)
        } finally {
            if (seq === requestSeq.current) {
                setIsLoading(false)
                setIsLoadingMore(false)
            }
        }
    }

    const loadMore = useCallback(() => {
        if (!isLoadingMore && hasMore) {
            fetchProducts(offset)
        }
    }, [offset, isLoadingMore, hasMore])

    const scrollRef = useInfiniteScroll(loadMore, { enabled: hasMore && !isLoading })

    const formatPrice = (price: number, currency: string) => {
        const symbols: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", JPY: "¥", AUD: "A$", SGD: "S$" }
        return `${symbols[currency] || currency}${price.toFixed(currency === "JPY" ? 0 : 2)}`
    }

    const handleWishlist = (product: Product) => {
        const item = {
            id: product.id,
            name: product.title,
            price: product.price,
            currency: product.currency,
            image: product.image_url,
            url: product.product_url,
            region: product.region,
            handle: product.handle,
        }
        if (isInWishlist(product.id)) removeItem(product.id)
        else addItem(item)
    }

    const toggleGroup = (group: string) => {
        const newExpanded = new Set(expandedGroups)
        if (newExpanded.has(group)) newExpanded.delete(group)
        else newExpanded.add(group)
        setExpandedGroups(newExpanded)
    }

    const clearFilters = () => {
        setSelectedRegion("all")
        setSelectedProductTypes([])
        setSelectedCategoryLabel(null)
        setSelectedSize(null)
        setInStockOnly(false)
    }

    const hasActiveFilters = selectedRegion !== "all" || selectedProductTypes.length > 0 || !!selectedSize || inStockOnly

    // Group products by handle for price comparison
    const groupedByHandle = useMemo(() => {
        if (!compareMode) return null
        const groups = new Map<string, Product[]>()
        products.forEach((p) => {
            const existing = groups.get(p.handle) || []
            existing.push(p)
            groups.set(p.handle, existing)
        })
        return groups
    }, [products, compareMode])

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Shared fixed header with page-specific actions (search lives in the header) */}
            <Header
                actions={
                    <>
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            aria-label="Filters"
                            className="lg:hidden flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <Menu className="w-4 h-4" />
                        </button>
                        
                    </>
                }
            />

            <div className="pt-12 flex">
                {/* Sidebar */}
                <aside className={`fixed lg:sticky top-12 left-0 h-[calc(100vh-48px)] w-64 bg-background border-r border-border z-40 transform transition-transform lg:transform-none overflow-y-auto ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
                    <div className="p-5">
                        <button onClick={() => setSidebarOpen(false)} className="lg:hidden absolute top-3 right-3 p-2 rounded-full hover:bg-secondary"><X className="w-4 h-4" /></button>

                        {/* View */}
                        <div className="mb-7">
                            <h3 className="label mb-3">View</h3>
                            <div className="space-y-1">
                                <button onClick={() => setInStockOnly(!inStockOnly)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${inStockOnly ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                                    <Package className="w-4 h-4" strokeWidth={1.8} />In stock only
                                </button>
                                <button onClick={() => setCompareMode(!compareMode)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${compareMode ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                                    <Globe className="w-4 h-4" strokeWidth={1.8} />Compare prices
                                </button>
                            </div>
                        </div>

                        {/* Sort */}
                        <div className="mb-7">
                            <h3 className="label mb-3">Sort</h3>
                            <div className="flex flex-wrap gap-1.5">
                                {([
                                    ["newest", "Newest"],
                                    ["price_asc", "Price ↑"],
                                    ["price_desc", "Price ↓"],
                                ] as const).map(([value, label]) => (
                                    <button
                                        key={value}
                                        onClick={() => setSortBy(value)}
                                        className={`pill px-3.5 py-1.5 text-xs transition-colors ${sortBy === value ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Region Filter */}
                        <div className="mb-7">
                            <h3 className="label mb-3">Region</h3>
                            <div className="space-y-0.5">
                                {REGIONS.map((r) => (
                                    <button key={r.code} onClick={() => setSelectedRegion(r.code)} className={`w-full text-left px-3 py-1.5 rounded-lg text-[13px] transition-colors ${selectedRegion === r.code ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                                        {r.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Category Accordion */}
                        <div className="mb-7">
                            <h3 className="label mb-3">Category</h3>
                            <div className="space-y-0.5">
                                <button onClick={() => { setSelectedProductTypes([]); setSelectedCategoryLabel(null) }} className={`w-full text-left px-3 py-1.5 rounded-lg text-[13px] transition-colors ${!selectedCategoryLabel ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                                    All categories
                                </button>
                                {Object.entries(CATEGORY_GROUPS).map(([group, subcategories]) => (
                                    <div key={group}>
                                        <button onClick={() => toggleGroup(group)} className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[13px] text-muted-foreground hover:text-foreground transition-colors">
                                            {group}
                                            {expandedGroups.has(group) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                        </button>
                                        {expandedGroups.has(group) && (
                                            <div className="pl-3 space-y-0.5 mt-0.5">
                                                {Object.entries(subcategories).map(([label, productTypes]) => (
                                                    <button key={label} onClick={() => { setSelectedProductTypes(productTypes); setSelectedCategoryLabel(label) }} className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${selectedCategoryLabel === label ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Size Filter */}
                        <div className="mb-7">
                            <h3 className="label mb-3">Size</h3>
                            <div className="flex flex-wrap gap-1.5">
                                {SIZES.map((size) => (
                                    <button key={size} onClick={() => setSelectedSize(selectedSize === size ? null : size)} className={`pill min-w-9 px-3 py-1.5 text-xs transition-colors ${selectedSize === size ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Clear Filters */}
                        {hasActiveFilters && (
                            <button onClick={clearFilters} className="w-full text-center text-[13px] text-muted-foreground hover:text-foreground transition-colors py-2">Clear all filters</button>
                        )}
                    </div>
                </aside>

                {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

                {/* Main Content - scrolls independently */}
                <main className="flex-1 h-[calc(100vh-48px)] overflow-y-auto">
                    <div className="px-4 lg:px-8 pt-8 pb-5 flex items-end justify-between">
                        <div>
                            <h1 className="display text-2xl md:text-3xl">{sortBy === "newest" ? "Latest drops" : "All products"}</h1>
                            <p className="text-[13px] text-muted-foreground mt-1">{totalProducts.toLocaleString()} items across 6 regions</p>
                        </div>
                        {hasActiveFilters && (
                            <span className="pill inline-flex items-center gap-1.5 bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground">
                                <Filter className="w-3 h-3" /> Filtered
                            </span>
                        )}
                    </div>

                    <div className="px-4 lg:px-8 py-6">
                        {isLoading ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {Array.from({ length: 8 }).map((_, i) => (<div key={i} className="space-y-2"><div className="aspect-[3/4] bg-muted animate-pulse" /><div className="h-3 bg-muted animate-pulse w-3/4" /></div>))}
                            </div>
                        ) : products.length === 0 ? (
                            <div className="text-center py-20">
                                <Package className="w-10 h-10 mx-auto text-muted-foreground mb-4" strokeWidth={1.5} />
                                <p className="text-sm text-muted-foreground">No products found</p>
                                <button onClick={clearFilters} className="pill mt-5 px-5 py-2 bg-secondary text-[13px] font-medium hover:bg-border transition-colors">Clear filters</button>
                            </div>
                        ) : compareMode && groupedByHandle ? (
                            // Price Comparison View
                            <div className="space-y-4">
                                {Array.from(groupedByHandle.entries()).slice(0, 20).map(([handle, variants]) => (
                                    <div key={handle} className="rounded-2xl bg-secondary p-4">
                                        <div className="flex gap-4">
                                            <div className="w-20 h-28 rounded-xl overflow-hidden bg-background flex-shrink-0">
                                                <ImageWithLoading src={variants[0].image_url} alt={variants[0].title} className="w-full h-full object-cover" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-[13px] font-medium mb-3 truncate">{variants[0].title}</h3>
                                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                                                    {variants.sort((a, b) => a.price - b.price).map((v) => (
                                                        <a key={v.id} href={v.product_url} target="_blank" rel="noopener noreferrer" className={`rounded-xl bg-background p-2.5 text-center transition-opacity ${v.is_available ? "hover:opacity-70" : "opacity-40"}`}>
                                                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{v.region}</p>
                                                            <p className="text-[13px] font-medium mt-0.5">{formatPrice(v.price, v.currency)}</p>
                                                            {!v.is_available && <p className="text-[10px] text-muted-foreground">Sold out</p>}
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            // Grid View
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
                                {products.map((product, index) => {
                                    const inWishlist = isInWishlist(product.id)
                                    const isNew = Date.now() - new Date(product.first_seen_at).getTime() < 48 * 3600 * 1000
                                    // compare_price is the retailer's claim about its own
                                    // past; the verdict is ours, from what we recorded the
                                    // listing costing. Where we have no record, no claim.
                                    const verdict = priceVerdict(product.price, priceStats[product.id] ?? null)
                                    const left = scarcity(product.available_variants, product.total_variants)
                                    return (
                                        <div key={product.id} className={`group transition-opacity duration-300 ${isPageLoaded ? "opacity-100" : "opacity-0"}`} style={{ transitionDelay: `${Math.min(index * 15, 150)}ms` }}>
                                            <div className="relative aspect-[3/4] bg-secondary rounded-2xl overflow-hidden">
                                                <div className="absolute top-3 left-3 z-20 flex flex-col items-start gap-1.5">
                                                    <span className="pill bg-background/90 backdrop-blur px-2.5 py-1 text-[11px] font-medium uppercase">{product.region}</span>
                                                    {isNew && <span className="pill bg-foreground text-background px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide">New</span>}
                                                    {verdict.label && (
                                                        <span className={`pill px-2.5 py-1 text-[10px] font-semibold ${verdict.isLow ? "bg-signal text-signal-foreground" : "bg-background/90 backdrop-blur"}`}>
                                                            {verdict.label}
                                                        </span>
                                                    )}
                                                    {left?.isLow && (
                                                        <span className="pill bg-background/90 backdrop-blur px-2.5 py-1 text-[10px] font-medium">{left.label}</span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => handleWishlist(product)}
                                                    aria-label="Toggle wishlist"
                                                    className={`pill absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center transition-all ${inWishlist ? "bg-primary text-primary-foreground" : "bg-background/90 backdrop-blur text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-foreground"}`}
                                                >
                                                    <Heart className={`w-3.5 h-3.5 ${inWishlist ? "fill-current" : ""}`} />
                                                </button>
                                                {!product.is_available && (
                                                    <div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-[2px] flex items-center justify-center">
                                                        <span className="pill bg-background px-3 py-1.5 text-xs font-medium">Sold out</span>
                                                    </div>
                                                )}
                                                <Link href={`/product/${product.id}`} className="block w-full h-full">
                                                    <ImageWithLoading src={product.image_url} alt={product.title} className="w-full h-full object-cover product-image-zoom" />
                                                </Link>
                                            </div>
                                            <Link href={`/product/${product.id}`} className="flex items-baseline justify-between gap-3 mt-3 px-1">
                                                <h3 className="text-[13px] font-medium leading-snug line-clamp-1">{product.title}</h3>
                                                <p className="text-[13px] shrink-0">
                                                    {verdict.isLow && (
                                                        <span className="text-muted-foreground/60 line-through mr-1.5">{formatPrice(priceStats[product.id]!.high, product.currency)}</span>
                                                    )}
                                                    <span className={verdict.isLow ? "text-signal font-medium" : "text-muted-foreground"}>{formatPrice(product.price, product.currency)}</span>
                                                </p>
                                            </Link>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {hasMore && products.length > 0 && !compareMode && (
                            <div ref={scrollRef} className="mt-8 flex flex-col items-center gap-4">
                                {isLoadingMore ? (
                                    <div className="text-[13px] text-muted-foreground">Loading…</div>
                                ) : (
                                    <button
                                        onClick={() => loadMore()}
                                        className="pill px-6 py-2.5 bg-secondary text-[13px] font-medium hover:bg-border transition-colors"
                                    >
                                        Load more
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </main>
            </div>

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
