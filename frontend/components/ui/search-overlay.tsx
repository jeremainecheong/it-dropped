"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Search, X, Filter, Heart } from "lucide-react"
import { toast } from "sonner"
import { ImageWithLoading } from "@/components/image-with-loading"
import { useWishlist } from "@/lib/wishlist-context"

interface SearchResult {
    id: string
    /** search_products returns SETOF products, so the real handle is here —
     *  passing it means a save from search keys the same as one from the shop
     *  grid instead of falling back to the product id as its handle. */
    handle?: string
    title: string
    price: number
    currency: string
    image_url: string
    product_url: string
    region: string
    is_available: boolean
}

interface SearchOverlayProps {
    isOpen: boolean
    onClose: () => void
}

const REGIONS = [
    { code: "all", name: "All Regions" },
    { code: "us", name: "US" },
    { code: "uk", name: "UK" },
    { code: "eu", name: "EU" },
    { code: "jp", name: "JP" },
    { code: "au", name: "AU" },
    { code: "sg", name: "SG" },
]

export function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<SearchResult[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [showFilters, setShowFilters] = useState(false)
    const [region, setRegion] = useState("all")
    const [availableOnly, setAvailableOnly] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const { addItem, removeItem, isInWishlist } = useWishlist()

    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100)
        }
        if (!isOpen) {
            setQuery("")
            setResults([])
            setShowFilters(false)
            // Reset filters too — otherwise they stay active but invisible next open
            setRegion("all")
            setAvailableOnly(false)
        }
    }, [isOpen])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
        }
        if (isOpen) {
            document.addEventListener("keydown", handleKeyDown)
            document.body.style.overflow = "hidden"
            return () => {
                document.removeEventListener("keydown", handleKeyDown)
                document.body.style.overflow = ""
            }
        }
    }, [isOpen, onClose])

    useEffect(() => {
        if (!query.trim()) {
            setResults([])
            return
        }

        const controller = new AbortController()
        const timer = setTimeout(async () => {
            setIsSearching(true)
            try {
                let url = `/api/dropradar/products/search?q=${encodeURIComponent(query)}&limit=24`
                if (region !== "all") {
                    url += `&region=${region}`
                }
                const response = await fetch(url, { signal: controller.signal })
                const data = await response.json()
                if (data.success) {
                    let filtered = data.data || []
                    if (availableOnly) {
                        filtered = filtered.filter((p: SearchResult) => p.is_available)
                    }
                    setResults(filtered)
                }
            } catch (error) {
                // Aborted requests are expected as the user keeps typing
                if ((error as Error).name !== "AbortError") {
                    console.error("Search error:", error)
                    // Without this the overlay just shows "No results", which
                    // reads as "nothing matched" rather than "the request failed".
                    toast.error("Search failed. Check your connection and try again.")
                }
            } finally {
                if (!controller.signal.aborted) setIsSearching(false)
            }
        }, 300)

        return () => {
            clearTimeout(timer)
            controller.abort()
        }
    }, [query, region, availableOnly])

    const formatPrice = (price: number, currency: string) => {
        const symbols: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", JPY: "¥", AUD: "A$", SGD: "S$" }
        return `${symbols[currency] || currency}${price.toFixed(currency === "JPY" ? 0 : 2)}`
    }

    // The context is the one place that knows a save can be keyed by product id
    // or, for rows written before product_id existed, by handle. This checked
    // item.id alone, so a saved item's heart never filled in here.
    const isWishlisted = isInWishlist

    const handleWishlist = (item: SearchResult, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (isWishlisted(item.id)) {
            removeItem(item.id)
        } else {
            addItem({
                id: item.id,
                name: item.title,
                price: item.price,
                currency: item.currency,
                image: item.image_url,
                url: item.product_url,
                region: item.region,
                handle: item.handle,
            })
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl animate-fade-in">
            <div className="border-b border-border">
                <div className="mx-auto max-w-6xl flex items-center gap-3 px-4 sm:px-6 h-14">
                    <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search every region…"
                        className="flex-1 min-w-0 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
                    />
                    {/* px-0! — .chip's unlayered padding outranks the layered
                        utility; this one holds an icon, nothing else. */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        aria-label="Filters"
                        className={`chip w-8 justify-center px-0! ${showFilters ? "chip-on" : ""}`}
                    >
                        <Filter className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onClose}
                        aria-label="Close search"
                        className="btn btn-ghost btn-icon"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {showFilters && (
                    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 border-t border-border flex flex-wrap items-center gap-x-6 gap-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="label">Region</span>
                            <div className="flex gap-1.5 flex-wrap">
                                {REGIONS.map((r) => (
                                    <button
                                        key={r.code}
                                        onClick={() => setRegion(r.code)}
                                        className={`chip ${region === r.code ? "chip-on" : ""}`}
                                    >
                                        {r.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <button
                            onClick={() => setAvailableOnly(!availableOnly)}
                            className={`chip ${availableOnly ? "chip-on" : ""}`}
                        >
                            In stock only
                        </button>
                    </div>
                )}
            </div>

            <div className="overflow-y-auto h-[calc(100vh-56px)] scrollbar-hide">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
                    {isSearching ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="space-y-2">
                                    <div className="aspect-[3/4] rounded-2xl image-loading" />
                                    <div className="h-3 w-3/4 rounded image-loading" />
                                </div>
                            ))}
                        </div>
                    ) : results.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                            {results.map((item, i) => (
                                <div
                                    key={item.id}
                                    className="group relative opacity-0 animate-rise"
                                    style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}
                                >
                                    <Link href={`/product/${item.id}`} onClick={onClose}>
                                        <div className="aspect-[3/4] bg-secondary rounded-2xl mb-2.5 overflow-hidden relative">
                                            <ImageWithLoading
                                                src={item.image_url}
                                                alt={item.title}
                                                className="w-full h-full object-cover product-image-zoom"
                                            />
                                            {!item.is_available && (
                                                <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] flex items-center justify-center">
                                                    <span className="pill bg-background px-2.5 py-1 text-[11px] font-medium">Sold out</span>
                                                </div>
                                            )}
                                        </div>
                                        <h3 className="text-[13px] font-medium line-clamp-1 px-0.5">{item.title}</h3>
                                        <div className="flex items-center justify-between text-[13px] text-muted-foreground px-0.5">
                                            <span className="num">{formatPrice(item.price, item.currency)}</span>
                                            <span className="uppercase text-[11px]">{item.region}</span>
                                        </div>
                                    </Link>
                                    <button
                                        onClick={(e) => handleWishlist(item, e)}
                                        aria-label="Toggle wishlist"
                                        className={`btn btn-icon absolute top-3 right-3 ${isWishlisted(item.id)
                                            ? "btn-primary"
                                            : "btn-secondary opacity-100 md:opacity-0 md:group-hover:opacity-100"
                                            }`}
                                    >
                                        <Heart className={`w-3.5 h-3.5 ${isWishlisted(item.id) ? "fill-current" : ""}`} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : query.trim() ? (
                        <div className="text-center py-20">
                            <Search className="w-9 h-9 mx-auto text-muted-foreground mb-4" strokeWidth={1.5} />
                            <p className="text-[15px] font-semibold mb-1">No results for &ldquo;{query}&rdquo;</p>
                            <p className="text-[13px] text-muted-foreground">Try a different term or widen the region filter.</p>
                        </div>
                    ) : (
                        <div className="text-center py-20">
                            <p className="text-[13px] text-muted-foreground">
                                Search every Stüssy release across six regions.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
