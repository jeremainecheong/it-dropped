"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Sparkles, RotateCcw, TrendingDown, TrendingUp, PackageX, Ruler } from "lucide-react"
import { ImageWithLoading } from "@/components/image-with-loading"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { formatPrice } from "@/lib/currency"

interface Drop {
  id: string
  product_id: string | null
  region: string
  change_type: string
  title: string
  price: number
  currency: string
  image_url: string
  product_url: string
  old_value: string
  new_value: string
  available_sizes: string[]
  detected_at: string
}

const CHANGE_TYPES = [
  { id: "", label: "Everything" },
  { id: "new", label: "New" },
  { id: "restock", label: "Restocks" },
  { id: "price_drop", label: "Price cuts" },
  { id: "sold_out", label: "Sold out" },
]

const TYPE_META: Record<string, { label: string; icon: typeof Sparkles; tone: string }> = {
  new: { label: "New", icon: Sparkles, tone: "bg-primary text-primary-foreground" },
  restock: { label: "Restock", icon: RotateCcw, tone: "bg-primary text-primary-foreground" },
  size_restock: { label: "Size back", icon: Ruler, tone: "bg-secondary text-foreground" },
  price_drop: { label: "Price cut", icon: TrendingDown, tone: "bg-signal text-signal-foreground" },
  price_increase: { label: "Price up", icon: TrendingUp, tone: "bg-secondary text-muted-foreground" },
  sold_out: { label: "Sold out", icon: PackageX, tone: "bg-secondary text-muted-foreground" },
  size_sold_out: { label: "Size gone", icon: PackageX, tone: "bg-secondary text-muted-foreground" },
}

const REGIONS = ["", "us", "uk", "eu", "jp", "au", "sg"]

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function DropsPage() {
  const [drops, setDrops] = useState<Drop[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [changeType, setChangeType] = useState("")
  const [region, setRegion] = useState("")

  const fetchDrops = useCallback(async () => {
    setIsLoading(true)
    try {
      let url = "/api/dropradar/drops?limit=60"
      if (changeType) url += `&type=${changeType}`
      if (region) url += `&region=${region}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) setDrops(data.data)
      else setDrops([])
    } catch {
      setDrops([])
    } finally {
      setIsLoading(false)
    }
  }, [changeType, region])

  useEffect(() => {
    fetchDrops()
  }, [fetchDrops])

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      <main className="flex-1 pt-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="pt-8 pb-6">
            <p className="label mb-1.5 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-signal" aria-hidden />
              Live feed
            </p>
            <h1 className="display text-2xl md:text-3xl">What dropped</h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              Every new release, restock and price change across six regions.
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-1.5 pb-6">
            {CHANGE_TYPES.map((t) => (
              <button
                key={t.id || "all"}
                onClick={() => setChangeType(t.id)}
                className={`pill px-3.5 py-1.5 text-xs transition-colors ${
                  changeType === t.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
            <span className="w-px h-4 bg-border mx-1.5" />
            {REGIONS.map((r) => (
              <button
                key={r || "all"}
                onClick={() => setRegion(r)}
                className={`pill px-3 py-1.5 text-xs uppercase transition-colors ${
                  region === r
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {r || "All"}
              </button>
            ))}
          </div>

          {/* Feed */}
          {isLoading ? (
            <div className="space-y-2 pb-16">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 rounded-2xl bg-secondary p-3">
                  <div className="w-14 h-16 rounded-xl image-loading" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 rounded image-loading" />
                    <div className="h-3 w-1/5 rounded image-loading" />
                  </div>
                </div>
              ))}
            </div>
          ) : drops.length === 0 ? (
            <div className="text-center py-24">
              <Sparkles className="w-9 h-9 mx-auto text-muted-foreground mb-4" strokeWidth={1.5} />
              <p className="text-[15px] font-semibold mb-1">Nothing here yet</p>
              <p className="text-[13px] text-muted-foreground max-w-xs mx-auto">
                Drops appear the moment the tracker sees them. Try a different filter.
              </p>
            </div>
          ) : (
            <div className="space-y-2 pb-16">
              {drops.map((drop) => {
                const meta = TYPE_META[drop.change_type] || TYPE_META.new
                const Icon = meta.icon
                const href = drop.product_id ? `/product/${drop.product_id}` : drop.product_url
                return (
                  <Link
                    key={drop.id}
                    href={href}
                    className="card-lift flex items-center gap-4 rounded-2xl bg-secondary p-3 pr-5"
                  >
                    <div className="w-14 h-16 rounded-xl overflow-hidden bg-background shrink-0">
                      <ImageWithLoading
                        src={drop.image_url}
                        alt={drop.title}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`pill inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold ${meta.tone}`}>
                          <Icon className="w-3 h-3" />
                          {meta.label}
                        </span>
                        <span className="text-[11px] uppercase text-muted-foreground">{drop.region}</span>
                      </div>
                      <h3 className="text-[13px] font-medium truncate">{drop.title}</h3>
                      {drop.change_type === "price_drop" && drop.old_value && (
                        <p className="text-[12px] text-muted-foreground">
                          <span className="line-through">
                            {formatPrice(parseFloat(drop.old_value), drop.currency)}
                          </span>{" "}
                          <span className="text-signal font-medium">
                            {formatPrice(drop.price, drop.currency)}
                          </span>
                        </p>
                      )}
                      {drop.change_type === "size_restock" && drop.new_value && (
                        <p className="text-[12px] text-muted-foreground">Sizes back: {drop.new_value}</p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-[13px] font-medium">{formatPrice(drop.price, drop.currency)}</p>
                      <p className="text-[11px] text-muted-foreground">{timeAgo(drop.detected_at)}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
