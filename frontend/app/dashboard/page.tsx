"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { ArrowUpRight, TrendingUp, TrendingDown, Package, Globe, Activity, BarChart2, Clock, AlertTriangle } from "lucide-react"
import { AuthGuard } from "@/components/auth-guard"
import { Header } from "@/components/layout/header"
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    Legend,
    ComposedChart,
    Scatter,
} from "recharts"

interface RegionStats {
    region: string
    active_drops_24h: number
    total_tracked_items: number
    top_category: string
}

const REGION_NAMES: Record<string, string> = {
    us: "US", uk: "UK", eu: "EU", jp: "JP", au: "AU", sg: "SG",
}

const REGION_FULL: Record<string, string> = {
    us: "United States", uk: "United Kingdom", eu: "Europe", jp: "Japan", au: "Australia", sg: "Singapore",
}

// Simulate historical data for demo
const generatePriceHistory = () => {
    const data = []
    let avgPrice = 95
    for (let i = 30; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const change = (Math.random() - 0.48) * 8
        avgPrice = Math.max(70, Math.min(130, avgPrice + change))
        data.push({
            date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            avg: Math.round(avgPrice),
            min: Math.round(avgPrice - 15 - Math.random() * 10),
            max: Math.round(avgPrice + 40 + Math.random() * 20),
        })
    }
    return data
}

const generateDropActivity = () => {
    const data = []
    for (let i = 6; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        data.push({
            day: date.toLocaleDateString("en-US", { weekday: "short" }),
            drops: Math.floor(Math.random() * 30) + 10,
            restocks: Math.floor(Math.random() * 15) + 5,
        })
    }
    return data
}

const COLORS = ["#000000", "#333333", "#555555", "#777777", "#999999", "#BBBBBB"]

export default function DashboardPage() {
    const [stats, setStats] = useState<RegionStats[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [priceHistory, setPriceHistory] = useState<Array<{ date: string, avg: number, min: number, max: number }>>([])
    const [dropActivity, setDropActivity] = useState<Array<{ day: string, drops: number, restocks: number }>>([])
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
        // Generate data client-side only to avoid hydration mismatch
        setPriceHistory(generatePriceHistory())
        setDropActivity(generateDropActivity())
        fetchStats()
    }, [])

    const fetchStats = async () => {
        try {
            const response = await fetch("/api/dropradar/stats")
            const data = await response.json()
            if (data.success) setStats(data.data || [])
        } catch (error) {
            console.error("Error:", error)
        } finally {
            setIsLoading(false)
        }
    }

    const totalProducts = stats.reduce((sum, s) => sum + s.total_tracked_items, 0)
    const totalDrops24h = stats.reduce((sum, s) => sum + s.active_drops_24h, 0)

    // Analytics computations
    const priceChange = useMemo(() => {
        if (priceHistory.length < 2) return 0
        const first = priceHistory[0].avg
        const last = priceHistory[priceHistory.length - 1].avg
        return ((last - first) / first * 100).toFixed(1)
    }, [priceHistory])

    const topRegion = useMemo(() => {
        if (!stats.length) return null
        return stats.reduce((prev, curr) => curr.total_tracked_items > prev.total_tracked_items ? curr : prev)
    }, [stats])

    const pieData = stats.map(s => ({ name: s.region.toUpperCase(), value: s.total_tracked_items }))

    const categoryData = useMemo(() => {
        const cats: Record<string, number> = {}
        stats.forEach(s => {
            if (s.top_category && s.top_category !== "N/A") {
                cats[s.top_category] = (cats[s.top_category] || 0) + 1
            }
        })
        return Object.entries(cats).map(([name, count]) => ({ name: name.replace(/^Mens /, ""), count }))
    }, [stats])

    return (
        <AuthGuard>
            <div className="min-h-screen bg-background text-foreground">
                {/* Header */}
                <Header />

                <main className="pt-12 mx-auto max-w-6xl px-4 sm:px-6">
                    {/* Header */}
                    <section className="pt-8 pb-6">
                        <h1 className="display text-2xl md:text-3xl">Dashboard</h1>
                        <p className="text-[13px] text-muted-foreground mt-1">Stüssy market intelligence, updated in real time.</p>
                    </section>

                    {/* Key Metrics */}
                    <section className="pb-6">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="rounded-2xl bg-secondary p-5">
                                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                                    <Package className="w-3.5 h-3.5" strokeWidth={1.8} />
                                    <span className="label">Total SKUs</span>
                                </div>
                                <p className="display text-2xl lg:text-3xl">{isLoading ? "—" : totalProducts.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground mt-1">Across all regions</p>
                            </div>
                            <div className="rounded-2xl bg-secondary p-5">
                                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                                    <Activity className="w-3.5 h-3.5" strokeWidth={1.8} />
                                    <span className="label">Drops (24h)</span>
                                </div>
                                <p className="display text-2xl lg:text-3xl">{isLoading ? "—" : totalDrops24h}</p>
                                <p className="text-xs text-muted-foreground mt-1">New products detected</p>
                            </div>
                            <div className="rounded-2xl bg-secondary p-5">
                                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                                    {Number(priceChange) >= 0 ? <TrendingUp className="w-3.5 h-3.5" strokeWidth={1.8} /> : <TrendingDown className="w-3.5 h-3.5" strokeWidth={1.8} />}
                                    <span className="label">Price trend (30d)</span>
                                </div>
                                <p className="display text-2xl lg:text-3xl">{priceChange}%</p>
                                <p className="text-xs text-muted-foreground mt-1">{Number(priceChange) >= 0 ? "Prices increasing" : "Prices decreasing"}</p>
                            </div>
                            <div className="rounded-2xl bg-secondary p-5">
                                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                                    <Globe className="w-3.5 h-3.5" strokeWidth={1.8} />
                                    <span className="label">Top region</span>
                                </div>
                                <p className="display text-2xl lg:text-3xl">{topRegion ? topRegion.region.toUpperCase() : "—"}</p>
                                <p className="text-xs text-muted-foreground mt-1">{topRegion ? `${topRegion.total_tracked_items} products` : ""}</p>
                            </div>
                        </div>
                    </section>

                    {/* Charts Row 1 */}
                    <section className="pb-6">
                        <div className="grid lg:grid-cols-2 gap-6">
                            {/* Price Range Chart */}
                            <div className="rounded-2xl border border-border p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="label">Price Band Analysis (30 Days)</h3>
                                    <span className="text-[10px] text-muted-foreground">Min / Avg / Max</span>
                                </div>
                                <div className="h-48">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={priceHistory}>
                                            <defs>
                                                <linearGradient id="colorBand" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#000" stopOpacity={0.1} />
                                                    <stop offset="95%" stopColor="#000" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={4} />
                                            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                                            <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", fontSize: 11 }} />
                                            <Area type="monotone" dataKey="max" stroke="none" fill="#e5e5e5" />
                                            <Area type="monotone" dataKey="min" stroke="none" fill="#fff" />
                                            <Line type="monotone" dataKey="avg" stroke="#000" strokeWidth={2} dot={false} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="mt-4 rounded-xl bg-muted px-3 py-2.5 text-[11px] leading-relaxed">
                                    {priceHistory.length > 0 ? (
                                        <>
                                            <strong>Insight:</strong> Average prices have {Number(priceChange) >= 0 ? "increased" : "decreased"} by {Math.abs(Number(priceChange))}% over the past 30 days. Current range: ${priceHistory[priceHistory.length - 1]?.min} - ${priceHistory[priceHistory.length - 1]?.max}.
                                        </>
                                    ) : (
                                        <span className="text-muted-foreground">Loading insights...</span>
                                    )}
                                </div>
                            </div>

                            {/* Drop Activity */}
                            <div className="rounded-2xl border border-border p-5">
                                <h3 className="label mb-4">Drop & Restock Activity (7 Days)</h3>
                                <div className="h-48">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={dropActivity}>
                                            <XAxis dataKey="day" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                                            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                                            <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", fontSize: 11 }} />
                                            <Legend wrapperStyle={{ fontSize: 10 }} />
                                            <Bar dataKey="drops" fill="#000" name="New Drops" />
                                            <Bar dataKey="restocks" fill="#999" name="Restocks" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="mt-4 rounded-xl bg-muted px-3 py-2.5 text-[11px] leading-relaxed">
                                    {dropActivity.length > 0 ? (
                                        <>
                                            <strong>Insight:</strong> {dropActivity.reduce((sum, d) => sum + d.drops, 0)} new drops and {dropActivity.reduce((sum, d) => sum + d.restocks, 0)} restocks detected this week. Peak activity on {dropActivity.reduce((prev, curr) => prev.drops > curr.drops ? prev : curr).day}.
                                        </>
                                    ) : (
                                        <span className="text-muted-foreground">Loading insights...</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Charts Row 2 */}
                    <section className="pb-6">
                        <div className="grid lg:grid-cols-3 gap-6">
                            {/* Regional Distribution */}
                            <div className="rounded-2xl border border-border p-5">
                                <h3 className="label mb-4">Regional Distribution</h3>
                                <div className="h-40">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="value" label={({ name }) => name} labelLine={false}>
                                                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip contentStyle={{ fontSize: 11 }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Top Categories */}
                            <div className="rounded-2xl border border-border p-5">
                                <h3 className="label mb-4">Hot Categories</h3>
                                <div className="space-y-2">
                                    {categoryData.length > 0 ? categoryData.map((cat, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs">
                                            <span className="truncate">{cat.name}</span>
                                            <span className="text-muted-foreground">{cat.count} regions</span>
                                        </div>
                                    )) : (
                                        <p className="text-xs text-muted-foreground">Loading...</p>
                                    )}
                                </div>
                            </div>

                            {/* Alerts */}
                            <div className="rounded-2xl border border-border p-5">
                                <h3 className="label mb-4">Market Alerts</h3>
                                <div className="space-y-3">
                                    <div className="flex items-start gap-2 text-xs">
                                        <AlertTriangle className="w-3 h-3 mt-0.5 text-muted-foreground" />
                                        <div>
                                            <p className="font-medium">High Drop Activity</p>
                                            <p className="text-muted-foreground">US region showing increased drops today</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs">
                                        <TrendingUp className="w-3 h-3 mt-0.5 text-muted-foreground" />
                                        <div>
                                            <p className="font-medium">Price Movement</p>
                                            <p className="text-muted-foreground">Sweatshirts trending {Number(priceChange) >= 0 ? "up" : "down"}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs">
                                        <Clock className="w-3 h-3 mt-0.5 text-muted-foreground" />
                                        <div>
                                            <p className="font-medium">Last Scrape</p>
                                            <p className="text-muted-foreground">All regions updated within 30 min</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Region Cards */}
                    <section className="pb-10">
                        <h2 className="label mb-4">By Region</h2>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {stats.map((region) => (
                                <Link key={region.region} href={`/shop?region=${region.region}`} className="group rounded-2xl bg-secondary p-5 card-hover hover:bg-border/60">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm uppercase tracking-wide">{REGION_FULL[region.region] || region.region}</span>
                                        <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <p className="text-2xl font-medium mb-1">{region.total_tracked_items}</p>
                                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                        <span>{region.active_drops_24h} drops (24h)</span>
                                        <span className="truncate ml-2">{region.top_category?.replace(/^Mens /, "") || "N/A"}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                </main>
            </div>
        </AuthGuard>
    )
}
