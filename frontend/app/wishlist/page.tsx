"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Heart, ArrowLeft, Trash2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useWishlist } from "@/lib/wishlist-context"
import { ImageWithLoading } from "@/components/image-with-loading"

export default function WishlistPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const { items, removeItem } = useWishlist()
  const [isPageLoaded, setIsPageLoaded] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login")
    }
    setIsPageLoaded(true)
  }, [user, authLoading, router])

  const formatPrice = (price: number, currency: string) => {
    const symbols: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", JPY: "¥", AUD: "A$", SGD: "S$" }
    return `${symbols[currency] || currency}${price.toFixed(currency === "JPY" ? 0 : 2)}`
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Stussy-style Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 lg:px-8 h-12">
          <Link
            href="/shop"
            className="flex items-center gap-2 text-xs uppercase tracking-wide link-underline"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to Shop
          </Link>

          <span className="text-base font-medium tracking-wide uppercase">Saved</span>

          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            {items.length} Items
          </span>
        </div>
      </header>

      <main className="pt-12">
        <div className="px-4 lg:px-8 py-8">
          {items.length === 0 ? (
            <div
              className={`min-h-[60vh] flex flex-col items-center justify-center text-center transition-opacity duration-300 ${isPageLoaded ? "opacity-100" : "opacity-0"
                }`}
            >
              <Heart className="w-10 h-10 text-muted-foreground mb-4" />
              <h2 className="text-sm uppercase tracking-wide mb-2">Your saved items</h2>
              <p className="text-xs text-muted-foreground mb-6 max-w-xs">
                Items you save will appear here. Start browsing to find something you like.
              </p>
              <Link
                href="/shop"
                className="px-6 py-2.5 bg-foreground text-background text-xs uppercase tracking-wide"
              >
                Shop Now
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-8">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className={`group transition-opacity duration-300 ${isPageLoaded ? "opacity-100" : "opacity-0"}`}
                  style={{ transitionDelay: `${Math.min(index * 20, 200)}ms` }}
                >
                  <div className="relative aspect-[3/4] bg-muted mb-3 overflow-hidden">
                    <button
                      onClick={() => removeItem(item.id)}
                      className="absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center bg-background text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                      <ImageWithLoading
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover product-image-zoom"
                      />
                    </a>

                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-0 left-0 right-0 py-3 bg-foreground text-background text-center text-xs uppercase tracking-wider opacity-0 group-hover:opacity-100 translate-y-full group-hover:translate-y-0 transition-all duration-200"
                    >
                      Quick Shop
                    </a>
                  </div>

                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    <h3 className="text-xs uppercase tracking-wide leading-snug mb-1 line-clamp-2">
                      {item.name}
                    </h3>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{formatPrice(item.price, item.currency)}</span>
                      <span className="text-muted-foreground uppercase">{item.region}</span>
                    </div>
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
