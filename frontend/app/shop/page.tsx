"use client"

import { Suspense, useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Search, Heart, User, ChevronDown, ChevronRight, X, Menu, Clock, Package, Globe, Filter } from "lucide-react"
import { ImageWithLoading } from "@/components/image-with-loading"
import { useAuth } from "@/lib/auth-context"
import { useWishlist } from "@/lib/wishlist-context"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { SearchOverlay } from "@/components/ui/search-overlay"
import { NotificationBell } from "@/components/ui/notification-bell"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { AuthGuard } from "@/components/auth-guard"

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
    const [selectedRegion, setSelectedRegion] = useState(searchParams.get("region") || "all")
    const [selectedProductTypes, setSelectedProductTypes] = useState<string[]>([])
    const [selectedCategoryLabel, setSelectedCategoryLabel] = useState<string | null>(null)
    const [selectedSize, setSelectedSize] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<"latest" | "all">("latest")
    const [compareMode, setCompareMode] = useState(false)
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Tops"]))

    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [isPageLoaded, setIsPageLoaded] = useState(false)
    const [searchOpen, setSearchOpen] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [totalProducts, setTotalProducts] = useState(0)

    const [offset, setOffset] = useState(0)
    const [hasMore, setHasMore] = useState(true)
    const LIMIT = 24

    useEffect(() => {
        setIsPageLoaded(true)
        fetchProducts(0, true)
    }, [])

    useEffect(() => {
        setOffset(0)
        setProducts([])
        setHasMore(true)
        fetchProducts(0, true)
    }, [selectedRegion, selectedProductTypes, selectedSize, viewMode])

    const fetchProducts = async (currentOffset: number, reset = false) => {
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

            if (viewMode === "latest") {
                url += `&sort=newest`
            }

            const response = await fetch(url)
            const data = await response.json()

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
            setIsLoading(false)
            setIsLoadingMore(false)
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
    }

    const hasActiveFilters = selectedRegion !== "all" || selectedProductTypes.length > 0 || selectedSize

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
            <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border">
                <div className="flex items-center justify-between px-4 lg:px-8 h-12">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-2 hover:bg-muted">
                            <Menu className="w-4 h-4" />
                        </button>
                        <Link href="/" className="text-base font-medium tracking-wide uppercase">it dropped!</Link>
                    </div>

                    <nav className="hidden md:flex items-center gap-6">
                        <Link href="/dashboard" className="text-sm uppercase tracking-wide link-underline">Dashboard</Link>
                        <Link href="/shop" className="text-sm uppercase tracking-wide bg-foreground text-background px-3 py-1">Shop</Link>
                        <Link href="/community" className="text-sm uppercase tracking-wide link-underline">Community</Link>
                    </nav>

                    <div className="flex items-center gap-3">
                        <button onClick={() => setSearchOpen(true)} className="p-2 hover:bg-muted"><Search className="w-4 h-4" /></button>
                        <ThemeToggle />
                        {user && <NotificationBell />}
                        {user ? (
                            <>
                                <Link href="/wishlist" className="p-2 hover:bg-muted"><Heart className="w-4 h-4" /></Link>
                                <Link href="/profile" className="flex items-center gap-2 px-3 py-1.5 bg-foreground text-background text-xs tracking-wide">
                                    <User className="w-3 h-3" />
                                    {user.name?.split(" ")[0] || "Profile"}
                                </Link>
                            </>
                        ) : (
                            <Link href="/login" className="text-xs uppercase tracking-wide link-underline">Account</Link>
                        )}
                    </div>
                </div>
            </header>

            <div className="pt-12 flex">
                {/* Sidebar */}
                <aside className={`fixed lg:sticky top-12 left-0 h-[calc(100vh-48px)] w-64 bg-background border-r border-border z-40 transform transition-transform lg:transform-none overflow-y-auto ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
                    <div className="p-4">
                        <button onClick={() => setSidebarOpen(false)} className="lg:hidden absolute top-2 right-2 p-2 hover:bg-muted"><X className="w-4 h-4" /></button>

                        {/* View Mode */}
                        <div className="mb-6">
                            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">View</h3>
                            <div className="space-y-1">
                                <button onClick={() => setViewMode("latest")} className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${viewMode === "latest" ? "bg-foreground text-background" : "hover:bg-muted"}`}>
                                    <Clock className="w-4 h-4" />Latest Drops
                                </button>
                                <button onClick={() => setViewMode("all")} className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${viewMode === "all" ? "bg-foreground text-background" : "hover:bg-muted"}`}>
                                    <Package className="w-4 h-4" />All Products
                                </button>
                            </div>
                        </div>

                        {/* Price Comparison Toggle */}
                        <div className="mb-6">
                            <button onClick={() => setCompareMode(!compareMode)} className={`w-full flex items-center gap-2 px-3 py-2 text-sm border ${compareMode ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground"}`}>
                                <Globe className="w-4 h-4" />Compare Prices
                            </button>
                        </div>

                        {/* Region Filter */}
                        <div className="mb-6">
                            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Region</h3>
                            <div className="space-y-1">
                                {REGIONS.map((r) => (
                                    <button key={r.code} onClick={() => setSelectedRegion(r.code)} className={`w-full text-left px-3 py-2 text-sm ${selectedRegion === r.code ? "bg-foreground text-background" : "hover:bg-muted"}`}>
                                        {r.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Category Accordion */}
                        <div className="mb-6">
                            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Category</h3>
                            <div className="space-y-1">
                                <button onClick={() => { setSelectedProductTypes([]); setSelectedCategoryLabel(null) }} className={`w-full text-left px-3 py-2 text-sm ${!selectedCategoryLabel ? "bg-foreground text-background" : "hover:bg-muted"}`}>
                                    All Categories
                                </button>
                                {Object.entries(CATEGORY_GROUPS).map(([group, subcategories]) => (
                                    <div key={group}>
                                        <button onClick={() => toggleGroup(group)} className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted">
                                            {group}
                                            {expandedGroups.has(group) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                        </button>
                                        {expandedGroups.has(group) && (
                                            <div className="pl-4 space-y-1">
                                                {Object.entries(subcategories).map(([label, productTypes]) => (
                                                    <button key={label} onClick={() => { setSelectedProductTypes(productTypes); setSelectedCategoryLabel(label) }} className={`w-full text-left px-3 py-1.5 text-xs ${selectedCategoryLabel === label ? "bg-foreground text-background" : "hover:bg-muted text-muted-foreground"}`}>
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
                        <div className="mb-6">
                            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Size</h3>
                            <div className="flex flex-wrap gap-1">
                                {SIZES.map((size) => (
                                    <button key={size} onClick={() => setSelectedSize(selectedSize === size ? null : size)} className={`px-2 py-1 text-xs border ${selectedSize === size ? "bg-foreground text-background border-foreground" : "border-border hover:border-foreground"}`}>
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Clear Filters */}
                        {hasActiveFilters && (
                            <button onClick={clearFilters} className="w-full text-center text-xs uppercase tracking-wider underline py-2">Clear All Filters</button>
                        )}
                    </div>
                </aside>

                {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

                {/* Main Content - scrolls independently */}
                <main className="flex-1 h-[calc(100vh-48px)] overflow-y-auto">
                    <div className="px-4 lg:px-8 py-4 border-b border-border flex items-center justify-between">
                        <div>
                            <h1 className="text-sm uppercase tracking-widest">{viewMode === "latest" ? "Latest Drops" : "All Products"}</h1>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">{totalProducts.toLocaleString()} Products</p>
                        </div>
                        {hasActiveFilters && (
                            <div className="flex items-center gap-2">
                                <Filter className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Filtered</span>
                            </div>
                        )}
                    </div>

                    <div className="px-4 lg:px-8 py-6">
                        {isLoading ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {Array.from({ length: 8 }).map((_, i) => (<div key={i} className="space-y-2"><div className="aspect-[3/4] bg-muted animate-pulse" /><div className="h-3 bg-muted animate-pulse w-3/4" /></div>))}
                            </div>
                        ) : products.length === 0 ? (
                            <div className="text-center py-16">
                                <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                                <p className="text-sm uppercase tracking-wider text-muted-foreground">No products found</p>
                                <button onClick={clearFilters} className="mt-4 text-xs uppercase tracking-wider underline">Clear Filters</button>
                            </div>
                        ) : compareMode && groupedByHandle ? (
                            // Price Comparison View
                            <div className="space-y-6">
                                {Array.from(groupedByHandle.entries()).slice(0, 20).map(([handle, variants]) => (
                                    <div key={handle} className="border border-border p-4">
                                        <div className="flex gap-4">
                                            <div className="w-24 h-32 bg-muted flex-shrink-0">
                                                <ImageWithLoading src={variants[0].image_url} alt={variants[0].title} className="w-full h-full object-cover" />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="text-sm uppercase tracking-wide mb-2">{variants[0].title}</h3>
                                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                                                    {variants.sort((a, b) => a.price - b.price).map((v) => (
                                                        <a key={v.id} href={v.product_url} target="_blank" rel="noopener noreferrer" className={`p-2 border text-center ${v.is_available ? "border-border hover:border-foreground" : "border-border/50 opacity-50"}`}>
                                                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{v.region}</p>
                                                            <p className="text-sm font-medium">{formatPrice(v.price, v.currency)}</p>
                                                            {!v.is_available && <p className="text-[9px] text-muted-foreground">Sold Out</p>}
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
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {products.map((product, index) => {
                                    const inWishlist = isInWishlist(product.id)
                                    return (
                                        <div key={product.id} className={`group transition-opacity duration-300 ${isPageLoaded ? "opacity-100" : "opacity-0"}`} style={{ transitionDelay: `${Math.min(index * 15, 150)}ms` }}>
                                            <div className="relative aspect-[3/4] bg-muted mb-2 overflow-hidden">
                                                <button onClick={() => handleWishlist(product)} className={`absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center transition-all ${inWishlist ? "bg-foreground text-background" : "bg-background opacity-0 group-hover:opacity-100"}`}>
                                                    <Heart className={`w-3 h-3 ${inWishlist ? "fill-current" : ""}`} />
                                                </button>
                                                <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-background text-[9px] uppercase tracking-wider">{product.region}</span>
                                                {!product.is_available && <div className="absolute inset-0 bg-background/70 flex items-center justify-center"><span className="text-[10px] uppercase">Sold Out</span></div>}
                                                <Link href={`/product/${product.id}`} className="block w-full h-full">
                                                    <ImageWithLoading src={product.image_url} alt={product.title} className="w-full h-full object-cover product-image-zoom" />
                                                </Link>
                                                <Link href={`/product/${product.id}`} className="absolute bottom-0 left-0 right-0 py-2.5 bg-foreground text-background text-center text-[10px] uppercase tracking-wider opacity-0 group-hover:opacity-100 translate-y-full group-hover:translate-y-0 transition-all duration-200">View Details</Link>
                                            </div>
                                            <Link href={`/product/${product.id}`}>
                                                <h3 className="text-[11px] uppercase tracking-wide leading-snug mb-0.5 line-clamp-2">{product.title}</h3>
                                                <p className="text-[11px] text-muted-foreground">{formatPrice(product.price, product.currency)}</p>
                                            </Link>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {hasMore && products.length > 0 && !compareMode && (
                            <div ref={scrollRef} className="mt-8 flex flex-col items-center gap-4">
                                {isLoadingMore ? (
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Loading...</div>
                                ) : (
                                    <button
                                        onClick={() => loadMore()}
                                        className="px-6 py-2 border border-border text-xs uppercase tracking-widest hover:bg-muted transition-colors"
                                    >
                                        Load More
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border pb-safe">
                <div className="flex items-center justify-around h-14">
                    <Link href="/" className="flex flex-col items-center gap-0.5 p-2 text-muted-foreground">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                        <span className="text-[10px]">Home</span>
                    </Link>
                    <Link href="/shop" className="flex flex-col items-center gap-0.5 p-2 text-foreground">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                        <span className="text-[10px]">Shop</span>
                    </Link>
                    <Link href="/community" className="flex flex-col items-center gap-0.5 p-2 text-muted-foreground">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        <span className="text-[10px]">Forum</span>
                    </Link>
                    <Link href={user ? "/profile" : "/login"} className="flex flex-col items-center gap-0.5 p-2 text-muted-foreground">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        <span className="text-[10px]">{user ? "Profile" : "Login"}</span>
                    </Link>
                </div>
            </nav>
        </div>
    )
}

export default function ShopPage() {
    return (
        <AuthGuard>
            <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <ShopPageContent />
            </Suspense>
        </AuthGuard>
    )
}
