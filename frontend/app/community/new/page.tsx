"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Search, X } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabase"
import { Header } from "@/components/layout/header"

interface Product {
    id: string
    title: string
    image_url: string
    region: string
}

const CATEGORIES = [
    { id: "general", label: "General", desc: "General discussion about anything" },
    { id: "drops", label: "Drops", desc: "Discuss new and upcoming drops" },
    { id: "fit-check", label: "Fit Check", desc: "Share and rate outfits" },
    { id: "price-talk", label: "Price Talk", desc: "Pricing discussions and comparisons" },
    { id: "wtb-wts", label: "WTB/WTS", desc: "Want to buy or sell items" },
]

export default function NewThreadPage() {
    const router = useRouter()
    const { user, isLoading: authLoading } = useAuth()

    const [title, setTitle] = useState("")
    const [content, setContent] = useState("")
    const [category, setCategory] = useState("general")
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [productSearch, setProductSearch] = useState("")
    const [productResults, setProductResults] = useState<Product[]>([])
    const [showProductSearch, setShowProductSearch] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState("")

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/login")
        }
    }, [user, authLoading, router])

    useEffect(() => {
        if (productSearch.length >= 2) {
            searchProducts()
        } else {
            setProductResults([])
        }
    }, [productSearch])

    const searchProducts = async () => {
        try {
            const response = await fetch(`/api/dropradar/products?search=${encodeURIComponent(productSearch)}&limit=5`)
            const data = await response.json()
            if (data.success) {
                setProductResults(data.data || [])
            }
        } catch (error) {
            console.error("Error:", error)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user) return

        if (!title.trim()) {
            setError("Please enter a title")
            return
        }
        if (!content.trim()) {
            setError("Please enter some content")
            return
        }

        setIsSubmitting(true)
        setError("")

        const { data, error: dbError } = await supabase
            .from("forum_threads")
            .insert({
                user_id: user.id,
                title: title.trim(),
                content: content.trim(),
                category,
                product_id: selectedProduct?.id || null,
            })
            .select("id")
            .single()

        if (dbError) {
            setError("Failed to create thread. Please try again.")
            setIsSubmitting(false)
        } else {
            router.push(`/community/${data.id}`)
        }
    }

    if (authLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-sm uppercase tracking-wide text-muted-foreground animate-pulse">Loading...</div>
            </div>
        )
    }

    if (!user) return null

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <Header />

            <main className="pt-12 max-w-2xl mx-auto px-4 sm:px-6 py-8">
                <div className="flex items-center justify-between mb-6">
                    <Link href="/community" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Cancel
                    </Link>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !title.trim() || !content.trim()}
                        className="pill px-5 py-2 bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-85 disabled:opacity-50"
                    >
                        {isSubmitting ? "Posting…" : "Post"}
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                            {error}
                        </div>
                    )}

                    {/* Category Selection */}
                    <div>
                        <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-3">
                            Category
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {CATEGORIES.map((cat) => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => setCategory(cat.id)}
                                    className={`p-3 text-left border transition-colors ${category === cat.id
                                            ? "border-foreground bg-foreground text-background"
                                            : "border-border hover:border-foreground/50"
                                        }`}
                                >
                                    <span className="text-sm font-medium">{cat.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Title */}
                    <div>
                        <label htmlFor="title" className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
                            Title
                        </label>
                        <input
                            id="title"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="What's on your mind?"
                            className="w-full px-4 py-3 bg-background border border-border text-lg focus:border-foreground focus:outline-none"
                            maxLength={200}
                        />
                        <p className="text-xs text-muted-foreground mt-1 text-right">{title.length}/200</p>
                    </div>

                    {/* Content */}
                    <div>
                        <label htmlFor="content" className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
                            Content
                        </label>
                        <textarea
                            id="content"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Share your thoughts, questions, or finds..."
                            className="w-full px-4 py-3 bg-background border border-border text-sm resize-none focus:border-foreground focus:outline-none"
                            rows={8}
                        />
                    </div>

                    {/* Product Link */}
                    <div>
                        <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
                            Link Product (Optional)
                        </label>

                        {selectedProduct ? (
                            <div className="flex items-center gap-3 p-3 border border-border">
                                <img src={selectedProduct.image_url} alt="" className="w-12 h-12 object-cover bg-muted" />
                                <div className="flex-1">
                                    <p className="text-sm font-medium truncate">{selectedProduct.title}</p>
                                    <p className="text-xs text-muted-foreground uppercase">{selectedProduct.region}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedProduct(null)}
                                    className="p-2 hover:bg-muted"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="flex items-center border border-border">
                                    <Search className="w-4 h-4 ml-3 text-muted-foreground" />
                                    <input
                                        type="text"
                                        value={productSearch}
                                        onChange={(e) => setProductSearch(e.target.value)}
                                        onFocus={() => setShowProductSearch(true)}
                                        placeholder="Search for a product..."
                                        className="flex-1 px-3 py-2 bg-transparent text-sm focus:outline-none"
                                    />
                                </div>

                                {showProductSearch && productResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 bg-background border border-border border-t-0 z-10 max-h-60 overflow-y-auto">
                                        {productResults.map((product) => (
                                            <button
                                                key={product.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedProduct(product)
                                                    setProductSearch("")
                                                    setShowProductSearch(false)
                                                }}
                                                className="w-full flex items-center gap-3 p-3 hover:bg-muted text-left"
                                            >
                                                <img src={product.image_url} alt="" className="w-10 h-10 object-cover bg-muted" />
                                                <div>
                                                    <p className="text-sm truncate">{product.title}</p>
                                                    <p className="text-xs text-muted-foreground uppercase">{product.region}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Submit Button (Mobile) */}
                    <button
                        type="submit"
                        disabled={isSubmitting || !title.trim() || !content.trim()}
                        className="w-full py-4 bg-foreground text-background text-sm uppercase tracking-wide font-medium disabled:opacity-50 md:hidden"
                    >
                        {isSubmitting ? "Posting..." : "Post Thread"}
                    </button>
                </form>
            </main>
        </div>
    )
}
