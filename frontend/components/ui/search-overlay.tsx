"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Search, X, Filter, Heart } from "lucide-react"
import { ImageWithLoading } from "@/components/image-with-loading"
import { useWishlist } from "@/lib/wishlist-context"

interface SearchResult {
    id: string
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

    const { items: wishlist, addItem, removeItem } = useWishlist()

    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100)
        }
        if (!isOpen) {
            setQuery("")
            setResults([])
            setShowFilters(false)
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

        const timer = setTimeout(async () => {
            setIsSearching(true)
            try {
                let url = `/api/dropradar/products/search?q=${encodeURIComponent(query)}&limit=24`
                if (region !== "all") {
                    url += `&region=${region}`
                }
                const response = await fetch(url)
                const data = await response.json()
                if (data.success) {
                    let filtered = data.data || []
                    if (availableOnly) {
                        filtered = filtered.filter((p: SearchResult) => p.is_available)
                    }
                    setResults(filtered)
                }
            } catch (error) {
                console.error("Search error:", error)
            } finally {
                setIsSearching(false)
            }
        }, 300)

        return () => clearTimeout(timer)
    }, [query, region, availableOnly])

    const formatPrice = (price: number, currency: string) => {
        const symbols: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", JPY: "¥", AUD: "A$", SGD: "S$" }
        return `${symbols[currency] || currency}${price.toFixed(currency === "JPY" ? 0 : 2)}`
    }

    const isWishlisted = (id: string) => wishlist.some((item) => item.id === id)

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
            })
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] bg-background">
            <div className="border-b border-border">
                <div className="flex items-center gap-4 px-4 lg:px-8 h-12">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="SEARCH"
                        className="flex-1 bg-transparent text-sm uppercase tracking-widest outline-none placeholder:text-muted-foreground"
                    />
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`p-2 transition-colors ${showFilters ? "bg-foreground text-background" : "hover:bg-muted"}`}
                    >
                        <Filter className="w-4 h-4" />
                    </button>
                    <button onClick={onClose} className="p-2 hover:bg-muted transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {showFilters && (
                    <div className="px-4 lg:px-8 py-3 border-t border-border flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-widest text-muted-foreground">Region:</span>
                            <div className="flex gap-1">
                                {REGIONS.map((r) => (
                                    <button
                                        key={r.code}
                                        onClick={() => setRegion(r.code)}
                                        className={`px-2 py-1 text-xs ${region === r.code
                                                ? "bg-foreground text-background"
                                                : "hover:bg-muted"
                                            }`}
                                    >
                                        {r.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={availableOnly}
                                onChange={(e) => setAvailableOnly(e.target.checked)}
                                className="w-4 h-4"
                            />
                            <span className="text-xs uppercase tracking-widest">In Stock Only</span>
                        </label>
                    </div>
                )}
            </div>

            <div className="overflow-y-auto h-[calc(100vh-48px)] scrollbar-hide">
                <div className="px-4 lg:px-8 py-8">
                    {isSearching ? (
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">Searching...</p>
                    ) : results.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 lg:gap-6">
                            {results.map((item) => (
                                <div key={item.id} className="group relative">
                                    <Link
                                        href={`/product/${item.id}`}
                                        onClick={onClose}
                                    >
                                        <div className="aspect-[3/4] bg-muted mb-2 overflow-hidden relative">
                                            <ImageWithLoading
                                                src={item.image_url}
                                                alt={item.title}
                                                className="w-full h-full object-cover product-image-zoom"
                                            />
                                            {!item.is_available && (
                                                <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                                                    <span className="text-xs uppercase tracking-widest">Sold Out</span>
                                                </div>
                                            )}
                                        </div>
                                        <h3 className="text-xs uppercase tracking-wide line-clamp-1 mb-0.5">{item.title}</h3>
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            <span>{formatPrice(item.price, item.currency)}</span>
                                            <span className="uppercase">{item.region}</span>
                                        </div>
                                    </Link>
                                    <button
                                        onClick={(e) => handleWishlist(item, e)}
                                        className={`absolute top-2 right-2 p-2 rounded transition-all opacity-0 group-hover:opacity-100 ${isWishlisted(item.id)
                                                ? "bg-foreground text-background"
                                                : "bg-background/80 hover:bg-foreground hover:text-background"
                                            }`}
                                    >
                                        <Heart className={`w-4 h-4 ${isWishlisted(item.id) ? "fill-current" : ""}`} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : query.trim() ? (
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                            No results found for "{query}"
                        </p>
                    ) : (
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                            Start typing to search
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
