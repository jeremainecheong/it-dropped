"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Globe, LineChart, Users } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { LogoMark } from "@/components/ui/logo"

const FEATURED_DROPS = [
  { title: "8 Ball Fleece Jacket", price: "$185", image: "https://cdn.shopify.com/s/files/1/0087/6193/3920/files/115690_BLAC_1.jpg", region: "US" },
  { title: "Stock Link Sweater", price: "$140", image: "https://cdn.shopify.com/s/files/1/0087/6193/3920/files/117752_NATU_1.jpg", region: "UK" },
  { title: "Basic Stüssy Tee", price: "$45", image: "https://cdn.shopify.com/s/files/1/0087/6193/3920/files/1904917_SAGE_1.jpg", region: "JP" },
  { title: "Stock Logo Hoodie", price: "$165", image: "https://cdn.shopify.com/s/files/1/0087/6193/3920/files/118572_CHAR_1.jpg", region: "EU" },
]

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
    icon: Users,
    title: "Community radar",
    body: "See what collectors are tracking in real time, share finds, and get alerts the moment something restocks.",
  },
]

const STATS = [
  { value: "12.4K", label: "Active users" },
  { value: "847K", label: "Drops tracked" },
  { value: "6", label: "Regions" },
]

export default function LandingPage() {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
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
            {FEATURED_DROPS.map((drop, i) => (
              <Link
                key={drop.title}
                href="/shop"
                className={`group ${isMounted ? "animate-rise" : "opacity-0"}`}
                style={{ animationDelay: `${150 + i * 90}ms` }}
              >
                <div className="card-lift relative aspect-[3/4] bg-secondary rounded-3xl overflow-hidden">
                  <img
                    src={drop.image}
                    alt={drop.title}
                    className="w-full h-full object-cover product-image-zoom"
                  />
                  <span className="absolute top-3 left-3 pill bg-background/90 backdrop-blur px-2.5 py-1 text-[11px] font-medium">
                    {drop.region}
                  </span>
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
            {STATS.map((stat) => (
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
              Free to start. Track drops, compare prices, join the community.
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
