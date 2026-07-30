"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Heart, ArrowLeft, Trash2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useWishlist } from "@/lib/wishlist-context"
import { ImageWithLoading } from "@/components/image-with-loading"
import { Header } from "@/components/layout/header"

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
        <div className="text-[13px] text-muted-foreground animate-pulse">Loading…</div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main className="pt-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h1 className="display text-2xl md:text-3xl">Saved</h1>
              <p className="text-[13px] text-muted-foreground mt-1">{items.length} {items.length === 1 ? "item" : "items"}</p>
            </div>
            <Link href="/shop" className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to shop
            </Link>
          </div>

          {items.length === 0 ? (
            <div
              className={`min-h-[55vh] flex flex-col items-center justify-center text-center transition-opacity duration-300 ${isPageLoaded ? "opacity-100" : "opacity-0"
                }`}
            >
              <Heart className="w-9 h-9 text-muted-foreground mb-4" strokeWidth={1.5} />
              <h2 className="text-[15px] font-semibold mb-1.5">Your saved items</h2>
              <p className="text-[13px] text-muted-foreground mb-6 max-w-xs">
                Items you save will appear here. Start browsing to find something you like.
              </p>
              <Link
                href="/shop"
                className="pill px-6 py-2.5 bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-85"
              >
                Shop now
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
                  <div className="relative aspect-[3/4] bg-secondary rounded-2xl mb-3 overflow-hidden">
                    <button
                      onClick={() => removeItem(item.id)}
                      aria-label="Remove from wishlist"
                      className="pill absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center bg-background/90 backdrop-blur text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all"
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
                  </div>

                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="block px-1">
                    <h3 className="text-[13px] font-medium leading-snug mb-0.5 line-clamp-1">
                      {item.name}
                    </h3>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-muted-foreground">{formatPrice(item.price, item.currency)}</span>
                      <span className="text-muted-foreground uppercase text-[11px]">{item.region}</span>
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
