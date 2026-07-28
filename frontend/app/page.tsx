"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Menu, X } from "lucide-react"
import { Marquee } from "@/components/ui/marquee"

// Mock data for social proof
const MOCK_ACTIVITY = [
  { user: "alex_k", action: "saved", item: "8 Ball Fleece Jacket", region: "US", time: "2m ago" },
  { user: "streetwear_jp", action: "tracking", item: "Stock Link Sweater", region: "JP", time: "5m ago" },
  { user: "london_hype", action: "alerted", item: "Basic Stüssy Tee", region: "UK", time: "8m ago" },
  { user: "drop_hunter", action: "saved", item: "Work Pant", region: "EU", time: "12m ago" },
  { user: "sg_collector", action: "tracking", item: "Canvas Coach Jacket", region: "SG", time: "15m ago" },
]

const MOCK_DROPS = [
  { title: "8 Ball Fleece Jacket", price: "$185", image: "https://cdn.shopify.com/s/files/1/0087/6193/3920/files/115690_BLAC_1.jpg", region: "US", watchers: 847 },
  { title: "Stock Link Sweater", price: "$140", image: "https://cdn.shopify.com/s/files/1/0087/6193/3920/files/117752_NATU_1.jpg", region: "UK", watchers: 623 },
  { title: "Basic Stüssy Tee", price: "$45", image: "https://cdn.shopify.com/s/files/1/0087/6193/3920/files/1904917_SAGE_1.jpg", region: "JP", watchers: 1205 },
  { title: "Stock Logo Hoodie", price: "$165", image: "https://cdn.shopify.com/s/files/1/0087/6193/3920/files/118572_CHAR_1.jpg", region: "EU", watchers: 912 },
]

const TICKER = [
  "IT DROPPED",
  "SS26 ARCHIVE",
  "LIVE DROP TRACKING",
  "6 REGIONS WORLDWIDE",
  "NEVER MISS A RELEASE",
  "RESTOCK ALERTS",
  "PRICE INTELLIGENCE",
]

const MANIFESTO = [
  {
    index: "01",
    title: "Six regions",
    body: "US, UK, EU, Japan, Australia & Singapore — monitored in parallel. Compare the same piece across every storefront, instantly.",
  },
  {
    index: "02",
    title: "Price intelligence",
    body: "Full price history, trend lines and cross-region arbitrage. Know the floor before you check out. Never overpay again.",
  },
  {
    index: "03",
    title: "A shared eye",
    body: "See what the community is watching in real time. Saves, alerts and the collective radar — the whole floor, one feed.",
  },
]

export default function LandingPage() {
  const [isMounted, setIsMounted] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [currentActivity, setCurrentActivity] = useState(0)

  useEffect(() => {
    setIsMounted(true)
    const interval = setInterval(() => {
      setCurrentActivity((prev) => (prev + 1) % MOCK_ACTIVITY.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ============ HEADER ============ */}
      <div className="fixed top-0 left-0 right-0 z-50">
        {/* Ticker */}
        <div className="bg-signal text-signal-foreground border-b border-foreground/10">
          <Marquee
            duration={38}
            className="py-1.5 font-mono text-[10px] uppercase tracking-[0.2em]"
            items={TICKER.map((t) => (
              <span key={t}>{t}</span>
            ))}
            separator={<span aria-hidden className="px-4 opacity-60">/</span>}
          />
        </div>

        <header className="bg-background/95 backdrop-blur-sm border-b border-foreground">
          <div className="flex items-center justify-between h-16 px-4 lg:px-6">
            <Link href="/" className="flex items-baseline gap-2 shrink-0">
              <span className="text-signal text-sm">✱</span>
              <span className="font-serif text-2xl md:text-[1.7rem] leading-none tracking-tight">It Dropped</span>
            </Link>

            <nav className="hidden md:flex items-center gap-8">
              {[
                { href: "/shop", label: "Shop", i: "01" },
                { href: "/community", label: "Community", i: "02" },
                { href: "/dashboard", label: "Dashboard", i: "03" },
              ].map((l) => (
                <Link key={l.href} href={l.href} className="group flex items-center gap-1.5">
                  <span className="font-mono text-[9px] tracking-widest text-signal">{l.i}</span>
                  <span className="text-xs uppercase tracking-[0.18em] link-underline">{l.label}</span>
                </Link>
              ))}
              <Link
                href="/login"
                className="pill flex items-center px-6 py-2.5 bg-foreground text-background hover:bg-signal text-xs uppercase tracking-[0.15em]"
              >
                Sign&nbsp;In
              </Link>
            </nav>

            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden flex items-center">
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden border-t border-foreground bg-background">
              <nav className="flex flex-col divide-y divide-border">
                {[
                  { href: "/shop", label: "Shop", i: "01" },
                  { href: "/community", label: "Community", i: "02" },
                  { href: "/dashboard", label: "Dashboard", i: "03" },
                ].map((l) => (
                  <Link key={l.href} href={l.href} className="flex items-center gap-3 px-6 py-4">
                    <span className="font-mono text-[10px] text-signal">{l.i}</span>
                    <span className="text-lg uppercase tracking-wide">{l.label}</span>
                  </Link>
                ))}
                <Link href="/login" className="px-6 py-4 bg-foreground text-background text-lg uppercase tracking-wide">Sign In →</Link>
              </nav>
            </div>
          )}
        </header>
      </div>

      {/* ============ HERO ============ */}
      <section className="relative pt-[6.5rem] border-b border-foreground">
        {/* meta bar */}
        <div className="flex items-center justify-between px-4 lg:px-6 py-2 border-b border-border font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>Issue Nº 001 — SS26</span>
          <span className="hidden sm:inline">Stüssy Drop Radar</span>
          <span className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-signal" />
            </span>
            Live
          </span>
        </div>

        <div className="grid lg:grid-cols-12">
          {/* Left — oversized editorial type */}
          <div className="lg:col-span-8 border-b lg:border-b-0 lg:border-r border-foreground px-4 lg:px-6 py-10 lg:py-16 flex flex-col justify-between">
            <div className={isMounted ? "animate-rise" : "opacity-0"}>
              <p className="mono-label text-muted-foreground mb-8">
                {MOCK_ACTIVITY[currentActivity]?.user}&nbsp;just&nbsp;{MOCK_ACTIVITY[currentActivity]?.action}&nbsp;&mdash;&nbsp;{MOCK_ACTIVITY[currentActivity]?.region}
              </p>

              <h1 className="display text-[clamp(3.25rem,15vw,13rem)]">
                It
                <br />
                <span className="inline-flex items-baseline gap-[0.15em]">
                  Drop<span className="text-signal">ped</span>
                </span>
              </h1>

              <p className="serif-accent text-[clamp(1.75rem,4.5vw,3.25rem)] leading-[1] mt-4 text-muted-foreground">
                the whole floor, one feed.
              </p>
            </div>

            <div className={`mt-12 lg:mt-16 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-8 ${isMounted ? "animate-rise" : "opacity-0"}`}>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                A live index of every Stüssy release across six regions. Track drops,
                clock restocks, compare prices and move before it&apos;s gone.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className="pill group inline-flex items-center gap-2.5 px-7 py-4 bg-foreground text-background text-xs uppercase tracking-[0.15em] hover:bg-signal"
                >
                  Start Tracking
                  <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </Link>
                <Link
                  href="/shop"
                  className="pill inline-flex items-center px-7 py-4 border border-foreground text-xs uppercase tracking-[0.15em] hover:bg-foreground hover:text-background"
                >
                  Browse Drops
                </Link>
              </div>
            </div>
          </div>

          {/* Right — gallery stack */}
          <div className="lg:col-span-4 grid grid-cols-2 grid-rows-2 divide-x divide-y divide-border">
            {MOCK_DROPS.map((drop, i) => (
              <Link
                key={drop.title}
                href="/shop"
                className="group relative aspect-square bg-muted overflow-hidden"
              >
                <img
                  src={drop.image}
                  alt={drop.title}
                  className="w-full h-full object-cover product-image-zoom"
                />
                <span className="absolute top-2 left-2 font-mono text-[9px] uppercase tracking-widest bg-background/90 text-foreground px-1.5 py-0.5">
                  {String(i + 1).padStart(2, "0")} / {drop.region}
                </span>
                <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform bg-foreground text-background px-2 py-1.5">
                  <p className="font-mono text-[9px] uppercase tracking-wider truncate">{drop.title}</p>
                  <p className="font-mono text-[9px] text-signal">{drop.price}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============ MARQUEE DIVIDER ============ */}
      <div className="bg-foreground text-background border-b border-foreground overflow-hidden">
        <Marquee
          duration={30}
          className="py-4"
          items={[
            <span key="1" className="display text-3xl md:text-5xl">Latest Drops</span>,
            <span key="2" className="serif-accent text-3xl md:text-5xl text-signal">new this week</span>,
            <span key="3" className="display text-3xl md:text-5xl">Restocks</span>,
            <span key="4" className="serif-accent text-3xl md:text-5xl text-signal">price alerts</span>,
          ]}
          separator={<span aria-hidden className="px-6 text-signal text-3xl md:text-5xl">✱</span>}
        />
      </div>

      {/* ============ DROPS INDEX ============ */}
      <section className="border-b border-foreground">
        <div className="flex items-end justify-between px-4 lg:px-6 py-6 border-b border-border">
          <div>
            <p className="mono-label text-muted-foreground mb-2">Index / 004</p>
            <h2 className="display text-4xl md:text-6xl">On&nbsp;the&nbsp;Radar</h2>
          </div>
          <Link href="/shop" className="hidden md:flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] link-underline">
            All Drops <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y divide-border border-b border-border">
          {MOCK_DROPS.map((drop, i) => (
            <Link key={drop.title} href="/shop" className="group relative bg-background">
              <div className="relative aspect-[3/4] bg-muted overflow-hidden">
                <img src={drop.image} alt={drop.title} className="w-full h-full object-cover product-image-zoom" />
                <span className="absolute top-0 left-0 font-mono text-[9px] uppercase tracking-widest bg-foreground text-background px-2 py-1">
                  {String(i + 1).padStart(3, "0")}
                </span>
                <span className="absolute top-0 right-0 font-mono text-[9px] uppercase tracking-widest bg-signal text-signal-foreground px-2 py-1">
                  {drop.region}
                </span>
                <div className="absolute inset-x-0 bottom-0 bg-foreground text-background px-2 py-2 translate-y-full group-hover:translate-y-0 transition-transform font-mono text-[9px] uppercase tracking-wider flex items-center justify-between">
                  <span>◉ {drop.watchers} watching</span>
                  <span className="text-signal">View →</span>
                </div>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <h3 className="text-[11px] uppercase tracking-wide truncate pr-2">{drop.title}</h3>
                <span className="font-mono text-[11px] shrink-0">{drop.price}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ============ TRANSMISSION LOG ============ */}
      <section className="border-b border-foreground">
        <div className="grid lg:grid-cols-12">
          <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-border px-4 lg:px-6 py-8 flex lg:flex-col justify-between">
            <div>
              <p className="mono-label text-signal mb-3">● Live Feed</p>
              <h2 className="display text-3xl md:text-4xl">Trans&shy;mission</h2>
            </div>
            <p className="serif-accent text-xl text-muted-foreground self-end">real-time radar</p>
          </div>

          <div className="lg:col-span-9 divide-y divide-border">
            {MOCK_ACTIVITY.map((activity, i) => (
              <div
                key={i}
                className={`grid grid-cols-12 items-center gap-2 px-4 lg:px-6 py-4 transition-colors ${
                  i === currentActivity ? "bg-muted" : ""
                }`}
              >
                <span className="col-span-2 lg:col-span-1 font-mono text-[10px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="col-span-4 lg:col-span-3 text-xs uppercase tracking-wide truncate">@{activity.user}</span>
                <span className="hidden lg:block lg:col-span-2 font-mono text-[10px] uppercase tracking-wider text-signal">
                  {activity.action}
                </span>
                <span className="col-span-4 lg:col-span-4 text-xs truncate text-muted-foreground">{activity.item}</span>
                <span className="col-span-2 lg:col-span-2 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {activity.region} · {activity.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ MANIFESTO ============ */}
      <section className="border-b border-foreground">
        <div className="px-4 lg:px-6 py-6 border-b border-border">
          <p className="mono-label text-muted-foreground mb-2">Index / 006 — Why</p>
          <h2 className="display text-4xl md:text-6xl">
            Everything you need,<span className="serif-accent text-signal text-[0.7em]"> nothing you don&apos;t.</span>
          </h2>
        </div>
        <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
          {MANIFESTO.map((m) => (
            <div key={m.index} className="group px-4 lg:px-6 py-10 hover:bg-foreground hover:text-background transition-colors">
              <div className="flex items-baseline justify-between mb-8">
                <span className="font-mono text-5xl md:text-6xl text-signal">{m.index}</span>
                <ArrowUpRight className="w-6 h-6 opacity-30 group-hover:opacity-100 transition-opacity" />
              </div>
              <h3 className="text-xl uppercase tracking-tight mb-3">{m.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground group-hover:text-background/70 transition-colors">
                {m.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="relative border-b border-foreground bg-foreground text-background overflow-hidden">
        <div className="px-4 lg:px-6 py-20 md:py-28 text-center">
          <p className="mono-label text-background/60 mb-6">Ready?</p>
          <h2 className="display text-[clamp(3rem,13vw,11rem)]">
            Join&nbsp;the
            <br />
            <span className="serif-accent text-signal normal-case tracking-normal">collective.</span>
          </h2>
          <p className="max-w-lg mx-auto mt-8 text-sm text-background/70 leading-relaxed">
            Track drops, compare prices and connect with collectors worldwide. Free to start,
            no card required.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-10 w-max mx-auto">
            <Link
              href="/signup"
              className="pill group inline-flex items-center gap-2.5 px-8 py-4 bg-signal text-signal-foreground text-xs uppercase tracking-[0.15em] hover:bg-background hover:text-foreground"
            >
              Create Free Account
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Link>
            <Link
              href="/shop"
              className="pill inline-flex items-center px-8 py-4 border border-background/40 text-background text-xs uppercase tracking-[0.15em] hover:bg-background hover:text-foreground"
            >
              Browse Without Account
            </Link>
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="bg-background">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border border-b border-border">
          <div className="col-span-2 md:col-span-2 px-4 lg:px-6 py-10">
            <p className="display text-4xl md:text-5xl mb-3">
              It Drop<span className="text-signal">ped</span>
            </p>
            <p className="serif-accent text-lg text-muted-foreground">Stüssy drop radar for collectors.</p>
          </div>
          <div className="px-4 lg:px-6 py-10">
            <p className="mono-label text-muted-foreground mb-4">Navigate</p>
            <ul className="space-y-2 text-sm uppercase tracking-wide">
              <li><Link href="/shop" className="link-underline">Shop</Link></li>
              <li><Link href="/community" className="link-underline">Community</Link></li>
              <li><Link href="/dashboard" className="link-underline">Dashboard</Link></li>
            </ul>
          </div>
          <div className="px-4 lg:px-6 py-10">
            <p className="mono-label text-muted-foreground mb-4">Account</p>
            <ul className="space-y-2 text-sm uppercase tracking-wide">
              <li><Link href="/login" className="link-underline">Sign In</Link></li>
              <li><Link href="/signup" className="link-underline">Register</Link></li>
              <li><Link href="/wishlist" className="link-underline">Wishlist</Link></li>
            </ul>
          </div>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-between gap-2 px-4 lg:px-6 py-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>© 2026 It Dropped — All rights reserved</span>
          <span>Not affiliated with Stüssy Inc.</span>
        </div>
      </footer>
    </div>
  )
}
