"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, ArrowUpRight, Users, Eye, TrendingUp, MessageCircle, Heart, Globe, Menu, X } from "lucide-react"

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

const STATS = [
  { label: "Active Users", value: "12.4K", icon: Users },
  { label: "Drops Tracked", value: "847K", icon: Eye },
  { label: "Saves Today", value: "2.3K", icon: Heart },
  { label: "Regions", value: "6", icon: Globe },
]

export default function LandingPage() {
  const [isMounted, setIsMounted] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [currentActivity, setCurrentActivity] = useState(0)

  useEffect(() => {
    setIsMounted(true)
    // Rotate activity feed
    const interval = setInterval(() => {
      setCurrentActivity((prev) => (prev + 1) % MOCK_ACTIVITY.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-foreground selection:text-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between px-6 lg:px-12 h-14">
          <Link href="/" className="text-lg font-medium tracking-tight uppercase">
            it dropped<span className="text-muted-foreground">!</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/shop" className="text-sm tracking-wide hover:text-muted-foreground transition-colors">Shop</Link>
            <Link href="/community" className="text-sm tracking-wide hover:text-muted-foreground transition-colors">Community</Link>
            <Link href="/dashboard" className="text-sm tracking-wide hover:text-muted-foreground transition-colors">Dashboard</Link>
            <Link href="/login" className="px-4 py-2 bg-foreground text-background text-sm tracking-wide hover:bg-foreground/90 transition-colors">
              Sign In
            </Link>
          </nav>

          {/* Mobile Menu Button */}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2">
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-14 left-0 right-0 bg-background border-b border-border p-6">
            <nav className="flex flex-col gap-4">
              <Link href="/shop" className="text-lg tracking-wide">Shop</Link>
              <Link href="/community" className="text-lg tracking-wide">Community</Link>
              <Link href="/dashboard" className="text-lg tracking-wide">Dashboard</Link>
              <Link href="/login" className="px-4 py-3 bg-foreground text-background text-center text-lg tracking-wide">Sign In</Link>
            </nav>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-14">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/20" />
        </div>

        <div className="relative w-full px-6 lg:px-12 py-20">
          <div className="grid lg:grid-cols-2 gap-16 items-center max-w-7xl mx-auto">
            {/* Left - Text Content */}
            <div className={`space-y-8 transition-all duration-1000 ${isMounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
              {/* Live Activity Badge */}
              <div className="inline-flex items-center gap-3 px-4 py-2 bg-muted/50 border border-border">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-xs tracking-wide text-muted-foreground">
                  {MOCK_ACTIVITY[currentActivity]?.user} just {MOCK_ACTIVITY[currentActivity]?.action} an item
                </span>
              </div>

              <h1 className="text-5xl lg:text-7xl font-light leading-[0.95] tracking-tight">
                Track Stüssy
                <br />
                drops with the
                <br />
                <span className="font-normal italic">community</span>
              </h1>

              <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
                Join thousands of collectors tracking drops, comparing prices, and never missing a release across 6 regions worldwide.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <Link href="/signup" className="group flex items-center gap-3 px-6 py-4 bg-foreground text-background text-sm tracking-wide font-medium hover:bg-foreground/90 transition-colors">
                  Start Tracking Free
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link href="/shop" className="px-6 py-4 border border-border text-sm tracking-wide hover:bg-muted transition-colors">
                  Browse Drops
                </Link>
              </div>

              {/* Stats Row */}
              <div className="flex flex-wrap gap-8 pt-4">
                {STATS.slice(0, 3).map((stat) => (
                  <div key={stat.label} className="flex items-center gap-3">
                    <stat.icon className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xl font-medium">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right - Product Preview Grid */}
            <div className={`relative transition-all duration-1000 delay-300 ${isMounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
              <div className="grid grid-cols-2 gap-3">
                {MOCK_DROPS.map((drop, i) => (
                  <div
                    key={drop.title}
                    className="group relative bg-muted aspect-[3/4] overflow-hidden"
                    style={{ animationDelay: `${i * 100}ms` }}
                  >
                    <img
                      src={drop.image}
                      alt={drop.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform">
                      <p className="text-white text-xs font-medium truncate">{drop.title}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-white/80 text-xs">{drop.price}</span>
                        <span className="flex items-center gap-1 text-white/60 text-xs">
                          <Eye className="w-3 h-3" />
                          {drop.watchers}
                        </span>
                      </div>
                    </div>
                    <span className="absolute top-2 right-2 px-2 py-0.5 bg-white text-black text-[10px] font-medium uppercase">
                      {drop.region}
                    </span>
                  </div>
                ))}
              </div>

              {/* Floating Social Card */}
              <div className="absolute -bottom-6 -left-6 p-4 bg-background border border-border shadow-xl max-w-[200px]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex -space-x-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="w-6 h-6 rounded-full bg-muted border-2 border-background" />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">+2.4K online</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  See what others are tracking in real-time
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Activity Feed Section */}
      <section className="border-t border-border py-20 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-12">
            <div>
              <p className="text-xs tracking-widest uppercase text-muted-foreground mb-2">Live Feed</p>
              <h2 className="text-3xl lg:text-4xl font-light">Community Activity</h2>
            </div>
            <Link href="/shop" className="hidden md:flex items-center gap-2 text-sm tracking-wide hover:text-muted-foreground transition-colors">
              View All <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="space-y-4">
            {MOCK_ACTIVITY.map((activity, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-4 border border-border hover:bg-muted/50 transition-colors ${i === currentActivity ? "border-foreground/50" : ""}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-medium uppercase">
                    {activity.user.slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm">
                      <span className="font-medium">@{activity.user}</span>
                      <span className="text-muted-foreground"> {activity.action} </span>
                      <span className="font-medium">{activity.item}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{activity.region} · {activity.time}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button className="p-2 hover:bg-muted rounded transition-colors">
                    <Heart className="w-4 h-4" />
                  </button>
                  <button className="p-2 hover:bg-muted rounded transition-colors">
                    <MessageCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-t border-border py-20 px-6 lg:px-12 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs tracking-widest uppercase text-muted-foreground mb-2">Features</p>
            <h2 className="text-3xl lg:text-4xl font-light">Everything you need</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Globe,
                title: "6 Region Tracking",
                desc: "Monitor US, UK, EU, Japan, Australia & Singapore simultaneously. Compare prices instantly.",
              },
              {
                icon: TrendingUp,
                title: "Price Analytics",
                desc: "Track price history, see trends, and know when to buy. Never overpay again.",
              },
              {
                icon: Users,
                title: "Community Driven",
                desc: "See what others are tracking, get recommendations, and join the conversation.",
              },
            ].map((feature) => (
              <div key={feature.title} className="group p-8 bg-background border border-border hover:border-foreground/50 transition-colors">
                <feature.icon className="w-8 h-8 mb-6 text-muted-foreground group-hover:text-foreground transition-colors" />
                <h3 className="text-lg font-medium mb-3">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border py-24 px-6 lg:px-12">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs tracking-widest uppercase text-muted-foreground mb-4">Ready?</p>
          <h2 className="text-4xl lg:text-5xl font-light mb-6">Join the community</h2>
          <p className="text-lg text-muted-foreground mb-10">
            Start tracking drops, comparing prices, and connecting with collectors worldwide.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/signup" className="group flex items-center gap-3 px-8 py-4 bg-foreground text-background text-sm tracking-wide font-medium hover:bg-foreground/90 transition-colors">
              Create Free Account
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/shop" className="px-8 py-4 border border-border text-sm tracking-wide hover:bg-muted transition-colors">
              Browse Without Account
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <p className="text-lg font-medium tracking-tight uppercase mb-1">it dropped!</p>
            <p className="text-xs text-muted-foreground">Stüssy drop tracker for collectors</p>
          </div>
          <div className="flex items-center gap-8 text-xs text-muted-foreground">
            <Link href="/shop" className="hover:text-foreground transition-colors">Shop</Link>
            <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
          </div>
          <p className="text-xs text-muted-foreground">© 2024</p>
        </div>
      </footer>
    </div>
  )
}
