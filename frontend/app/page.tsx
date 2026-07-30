"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Globe, LineChart, Timer } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { LogoMark } from "@/components/ui/logo"

interface FeaturedDrop {
  id?: string
  title: string
  price: string
  image: string
  region: string
  isNew?: boolean
  salePct?: number
}

// Shown until live drops load, and if the API is unreachable.
const FALLBACK_DROPS: FeaturedDrop[] = [
  { title: "8 Ball Fleece Jacket", price: "$185", image: "https://cdn.shopify.com/s/files/1/0087/6193/3920/files/115690_BLAC_1.jpg", region: "US" },
  { title: "Stock Link Sweater", price: "$140", image: "https://cdn.shopify.com/s/files/1/0087/6193/3920/files/117752_NATU_1.jpg", region: "UK" },
  { title: "Basic Stüssy Tee", price: "$45", image: "https://cdn.shopify.com/s/files/1/0087/6193/3920/files/1904917_SAGE_1.jpg", region: "JP" },
  { title: "Stock Logo Hoodie", price: "$165", image: "https://cdn.shopify.com/s/files/1/0087/6193/3920/files/118572_CHAR_1.jpg", region: "EU" },
]

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", GBP: "£", EUR: "€", JPY: "¥", AUD: "A$", SGD: "S$",
}

const formatPrice = (price: number, currency: string) =>
  `${CURRENCY_SYMBOLS[currency] || currency}${price.toFixed(currency === "JPY" ? 0 : 2)}`

const FEATURES = [
  {
    icon: Globe,
    title: "Six regions, one view",
    body: "US, UK, EU, Japan, Australia and Singapore monitored in parallel, so you can compare every storefront at a glance.",
  },
  {
    icon: LineChart,
    title: "Price intelligence",
    body: "Full price history and cross-region comparison. Know the floor before you check out — never overpay again.",
  },
  {
    icon: Timer,
    title: "Sell-out velocity",
    body: "How fast each style went last time, region by region — measured from observed sell-outs, so you know which pieces won't wait.",
  },
]

/**
 * Placeholders until the real numbers load. Every figure shown here comes from
 * the tracker's own database — the previous version claimed "12.4K active
 * users" and "847K drops tracked", both fabricated, on a product whose entire
 * pitch is data you can trust.
 */
const STATS_FALLBACK = [
  { value: "—", label: "Products tracked" },
  { value: "—", label: "Changes witnessed" },
  { value: "6", label: "Regions" },
]

export default function LandingPage() {
  const [isMounted, setIsMounted] = useState(false)
  const [drops, setDrops] = useState<FeaturedDrop[]>(FALLBACK_DROPS)
  const [stats, setStats] = useState(STATS_FALLBACK)

  useEffect(() => {
    setIsMounted(true)

    let cancelled = false

    // Real numbers from the same API the rest of the app reads. If either
    // request fails the placeholders stay — a dash is more honest than a
    // made-up figure.
    const loadStats = async () => {
      try {
        const [statsRes, dropsRes] = await Promise.all([
          fetch("/api/dropradar/stats").then((r) => r.json()),
          fetch("/api/dropradar/drops?limit=1").then((r) => r.json()),
        ])
        if (cancelled) return
        const regions: any[] = Array.isArray(statsRes?.data) ? statsRes.data : []
        const tracked = regions.reduce((acc, r) => acc + (r.total_tracked_items || 0), 0)
        const witnessed = dropsRes?.meta?.total
        setStats([
          { value: tracked ? tracked.toLocaleString() : "—", label: "Products tracked" },
          { value: typeof witnessed === "number" ? witnessed.toLocaleString() : "—", label: "Changes witnessed" },
          { value: String(regions.length || 6), label: "Regions" },
        ])
      } catch {
        // placeholders stay
      }
    }
    loadStats()

    const loadLatestDrops = async () => {
      try {
        const res = await fetch("/api/dropradar/products?limit=4&sort=newest&available=true")
        const json = await res.json()
        if (cancelled || !json?.success || !Array.isArray(json.data) || json.data.length === 0) return

        setDrops(
          json.data.map((p: any): FeaturedDrop => ({
            id: p.id,
            title: p.title,
            price: formatPrice(p.price, p.currency),
            image: p.image_url,
            region: String(p.region || "").toUpperCase(),
            isNew: Date.now() - new Date(p.first_seen_at).getTime() < 48 * 3600 * 1000,
            salePct: p.compare_price && p.compare_price > p.price
              ? Math.round((1 - p.price / p.compare_price) * 100)
              : 0,
          }))
        )
      } catch {
        // keep the curated fallback
      }
    }

    loadLatestDrops()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      <main className="flex-1 pt-12">
        {/* Hero */}
        <section className="mx-auto max-w-4xl px-6 pt-24 pb-20 sm:pt-32 sm:pb-28 text-center">
          <div className={isMounted ? "animate-rise" : "opacity-0"}>
            <span className="inline-flex items-center gap-2 pill bg-secondary px-3.5 py-1.5 text-xs font-medium text-muted-foreground">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal opacity-60" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-signal" />
              </span>
              Live in 6 regions
            </span>

            <h1 className="display text-6xl sm:text-7xl lg:text-[6.5rem] mt-8 tracking-[-0.03em]">
              Never miss
              <br />
              <span className="text-outline">a drop</span>
              <LogoMark className="inline-block w-[0.6em] h-[0.6em] ml-[0.08em] align-baseline" />
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed mt-7 max-w-xl mx-auto">
              It Dropped tracks every Stüssy release, restock and price change
              worldwide — quietly, in one place.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 mt-9">
              <Link
                href="/signup"
                className="pill group inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground text-sm font-medium hover:opacity-85"
              >
                Start tracking
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                href="/shop"
                className="pill inline-flex items-center px-6 py-3 bg-secondary text-sm font-medium hover:bg-border"
              >
                Browse drops
              </Link>
            </div>
          </div>
        </section>

        {/* Featured drops */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-24">
          <div className="flex items-end justify-between mb-6">
            <div>
              <p className="label mb-1.5 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-signal" aria-hidden />
                This week
              </p>
              <h2 className="display text-2xl sm:text-3xl">On the radar</h2>
            </div>
            <Link
              href="/shop"
              className="hidden sm:inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {drops.map((drop, i) => (
              <Link
                key={drop.id ?? drop.title}
                href={drop.id ? `/product/${drop.id}` : "/shop"}
                className={`group ${isMounted ? "animate-rise" : "opacity-0"}`}
                style={{ animationDelay: `${150 + i * 90}ms` }}
              >
                <div className="card-lift relative aspect-[3/4] bg-secondary rounded-3xl overflow-hidden">
                  <img
                    src={drop.image}
                    alt={drop.title}
                    className="w-full h-full object-cover product-image-zoom"
                  />
                  <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
                    <span className="pill bg-background/90 backdrop-blur px-2.5 py-1 text-[11px] font-medium">
                      {drop.region}
                    </span>
                    {drop.isNew && (
                      <span className="pill bg-foreground text-background px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide">
                        New
                      </span>
                    )}
                    {!!drop.salePct && drop.salePct > 0 && (
                      <span className="pill bg-signal text-signal-foreground px-2.5 py-1 text-[10px] font-semibold">
                        −{drop.salePct}%
                      </span>
                    )}
                  </div>
                  <span className="pill absolute bottom-3 right-3 bg-foreground text-background px-3 py-1.5 text-[12px] font-medium opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                    {drop.price}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3 mt-3.5 px-1">
                  <h3 className="text-[13px] font-medium truncate">{drop.title}</h3>
                  <span className="text-[13px] text-muted-foreground shrink-0">{drop.price}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-24">
          <div className="grid md:grid-cols-3 gap-4">
            {FEATURES.map((feature, i) => (
              <div key={feature.title} className="card-lift relative rounded-3xl bg-secondary p-8 overflow-hidden">
                <span className="absolute top-6 right-7 font-display text-sm font-semibold text-muted-foreground/40">
                  0{i + 1}
                </span>
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-background mb-6">
                  <feature.icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
                </span>
                <h3 className="text-[15px] font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Stats */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-24">
          <div className="flex flex-wrap justify-center gap-x-24 gap-y-8 py-2">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="display text-4xl sm:text-5xl">{stat.value}</p>
                <p className="text-[13px] text-muted-foreground mt-1.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-28">
          <div className="relative rounded-[2rem] bg-primary text-primary-foreground px-6 py-20 sm:py-24 text-center overflow-hidden">
            {/* watermark drop */}
            <LogoMark className="absolute -right-10 -bottom-14 w-64 h-64 opacity-[0.07] rotate-12 pointer-events-none" />

            <span className="inline-flex items-center gap-2 pill bg-primary-foreground/10 px-3.5 py-1.5 text-xs font-medium text-primary-foreground/70">
              <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse-soft" />
              Tracking runs 24/7
            </span>
            <h2 className="display text-4xl sm:text-5xl mt-6">Ready when you are.</h2>
            <p className="text-primary-foreground/60 mt-3.5 max-w-md mx-auto">
              Free to start. Track drops, compare landed prices, get alerted before it&apos;s gone.
            </p>
            <Link
              href="/signup"
              className="pill group inline-flex items-center gap-2 px-7 py-3.5 mt-9 bg-primary-foreground text-primary text-sm font-medium hover:opacity-90"
            >
              Create free account
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
