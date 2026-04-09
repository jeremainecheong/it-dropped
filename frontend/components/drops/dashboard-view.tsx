"use client"

import { useMemo } from "react"
import { motion } from "framer-motion"
import { ArrowUpRight, Clock, Tag, TrendingUp, BarChart3 } from "lucide-react"
import { RegionDashboard } from "./region-dashboard"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    AreaChart,
    Area,
    CartesianGrid,
    PieChart,
    Pie
} from "recharts"
import { ImageWithLoading } from "@/components/image-with-loading"
import Link from "next/link"

interface Drop {
    id: string
    product_id: string | null
    shopify_id: number
    region: string
    change_type: "new" | "restock" | "price_drop" | "price_increase" | "size_restock"
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

interface DashboardViewProps {
    latestDrops: Drop[]
    isLoading: boolean
}

const CHANGE_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
    new: { label: "NEW", color: "bg-accent text-accent-foreground" },
    restock: { label: "RESTOCK", color: "bg-green-600 text-white" },
    price_drop: { label: "SALE", color: "bg-blue-600 text-white" },
    price_increase: { label: "PRICE UP", color: "bg-orange-600 text-white" },
    size_restock: { label: "SIZE BACK", color: "bg-purple-600 text-white" },
}

export function DashboardView({ latestDrops, isLoading }: DashboardViewProps) {
    // Process data for charts
    const hourlyData = useMemo(() => {
        const hours: Record<string, number> = {}
        // Initialize last 12 hours
        for (let i = 0; i < 12; i++) {
            const d = new Date()
            d.setHours(d.getHours() - i)
            const key = d.getHours().toString().padStart(2, '0') + ":00"
            hours[key] = 0
        }

        latestDrops.forEach(drop => {
            const date = new Date(drop.detected_at)
            const key = date.getHours().toString().padStart(2, '0') + ":00"
            if (hours[key] !== undefined) {
                hours[key]++
            }
        })

        return Object.entries(hours)
            .reverse()
            .map(([time, count]) => ({ time, count }))
    }, [latestDrops])

    // Category Distribution (Pie) logic - Mock categorization based on title/price since we don't have explicit category field in Drop interface yet
    const categoryData = useMemo(() => {
        const cats: Record<string, number> = { "Tees": 0, "Hoodies": 0, "Accessories": 0, "Pants": 0, "Jackets": 0 }

        latestDrops.forEach(drop => {
            const t = drop.title.toLowerCase()
            if (t.includes("tee") || t.includes("t-shirt")) cats["Tees"]++
            else if (t.includes("hood") || t.includes("sweat")) cats["Hoodies"]++
            else if (t.includes("pant") || t.includes("short") || t.includes("jean")) cats["Pants"]++
            else if (t.includes("jacket") || t.includes("coat") || t.includes("vest")) cats["Jackets"]++
            else cats["Accessories"]++
        })

        return Object.entries(cats)
            .filter(([_, count]) => count > 0)
            .map(([name, value]) => ({ name, value }))
    }, [latestDrops])

    // Activity Heatmap logic (Day of Week vs Time of Day) - Simulated based on limited data
    const heatmapData = useMemo(() => {
        // Create 7 days x 4 time blocks (Morning, Afternoon, Evening, Night)
        const blocks = [
            { name: "Mon", data: [0, 0, 0, 0] },
            { name: "Tue", data: [0, 0, 0, 0] },
            { name: "Wed", data: [0, 0, 0, 0] },
            { name: "Thu", data: [0, 0, 0, 0] },
            { name: "Fri", data: [0, 0, 0, 0] },
            { name: "Sat", data: [0, 0, 0, 0] },
            { name: "Sun", data: [0, 0, 0, 0] },
        ]

        latestDrops.forEach(drop => {
            const d = new Date(drop.detected_at)
            const day = d.getDay() // 0 = Sun
            const hour = d.getHours()

            // Map Sunday(0) to index 6, Monday(1) to 0
            const dayIdx = day === 0 ? 6 : day - 1

            let timeIdx = 0
            if (hour >= 6 && hour < 12) timeIdx = 0 // Morning
            else if (hour >= 12 && hour < 18) timeIdx = 1 // Afternoon
            else if (hour >= 18 && hour < 24) timeIdx = 2 // Evening
            else timeIdx = 3 // Night

            blocks[dayIdx].data[timeIdx]++
        })
        return blocks
    }, [latestDrops])

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    const priceDistData = useMemo(() => {
        const ranges = [
            { name: "<$50", max: 50, count: 0 },
            { name: "$50-100", max: 100, count: 0 },
            { name: "$100-200", max: 200, count: 0 },
            { name: "$200+", max: Infinity, count: 0 },
        ]

        latestDrops.forEach(drop => {
            const price = drop.price
            const range = ranges.find(r => price < r.max)
            if (range) range.count++
        })

        return ranges
    }, [latestDrops])

    // Only take top 3 for summary
    const summaryDrops = latestDrops.slice(0, 3)

    const formatPrice = (price: number, currency: string) => {
        const symbols: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", JPY: "¥", AUD: "A$" }
        return `${symbols[currency] || currency}${price.toFixed(currency === "JPY" ? 0 : 2)}`
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        const now = new Date()
        const diff = (now.getTime() - date.getTime()) / 1000 / 60 // minutes
        if (diff < 60) return `${Math.floor(diff)}m ago`
        return `${Math.floor(diff / 60)}h ago`
    }

    if (isLoading) {
        return (
            <div className="space-y-8 animate-pulse">
                <div className="h-64 bg-muted rounded-lg" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="h-64 bg-muted rounded-lg" />
                    <div className="h-64 bg-muted rounded-lg" />
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-12 animate-in fade-in duration-700">
            {/* Live Activity Section */}
            <section>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <h2 className="text-sm font-bold uppercase tracking-widest">Live Activity</h2>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground uppercase">Real-time Global Stats</span>
                </div>
                <RegionDashboard />
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
                {/* Analytics Column */}
                <div className="lg:col-span-8 space-y-8">
                    <section className="bg-background border border-border p-6 md:p-8">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="font-bold uppercase tracking-wide flex items-center gap-2">
                                <BarChart3 className="w-4 h-4" />
                                Drop Activity (Last 12h)
                            </h3>
                        </div>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={hourlyData}>
                                    <defs>
                                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="currentColor" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                                    <XAxis
                                        dataKey="time"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
                                        dy={10}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', borderRadius: '0px' }}
                                        itemStyle={{ color: 'var(--foreground)', fontFamily: 'monospace', fontSize: '12px' }}
                                        cursor={{ stroke: 'var(--foreground)', opacity: 0.2 }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="count"
                                        stroke="currentColor"
                                        fillOpacity={1}
                                        fill="url(#colorCount)"
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </section>

                    {/* Activity Heatmap */}
                    <section className="bg-background border border-border p-6 md:p-8">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold uppercase tracking-wide flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" />
                                Activity Heatmap (Last 7 Days)
                            </h3>
                        </div>
                        <div className="grid grid-cols-8 gap-1 h-[200px]">
                            {/* Y-Axis Labels (Days) */}
                            <div className="flex flex-col justify-between py-2 text-[10px] font-mono text-muted-foreground uppercase text-right pr-2">
                                {heatmapData.map(d => <span key={d.name}>{d.name}</span>)}
                            </div>

                            {/* Heatmap Grid */}
                            <div className="col-span-7 grid grid-rows-7 gap-1">
                                {heatmapData.map((day, dIdx) => (
                                    <div key={day.name} className="grid grid-cols-4 gap-1">
                                        {day.data.map((val, tIdx) => (
                                            <div
                                                key={`${dIdx}-${tIdx}`}
                                                className="relative group bg-muted/30 hover:bg-muted transition-colors rounded-sm overflow-hidden"
                                                title={`${day.name} ${['Morning', 'Afternoon', 'Evening', 'Night'][tIdx]}: ${val} drops`}
                                            >
                                                {val > 0 && (
                                                    <div
                                                        className="absolute inset-0 bg-foreground"
                                                        style={{ opacity: Math.min(val * 0.2, 0.9) + 0.1 }}
                                                    />
                                                )}
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 text-[10px] font-bold text-background mix-blend-difference">
                                                    {val}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                            {/* X-Axis Labels (Time of Day) */}
                            <div className="col-start-2 col-span-7 grid grid-cols-4 text-[10px] font-mono text-muted-foreground uppercase text-center mt-1">
                                <span>Morning</span>
                                <span>Afternoon</span>
                                <span>Evening</span>
                                <span>Night</span>
                            </div>
                        </div>
                    </section>

                    <section className="bg-background border border-border p-6 md:p-8">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="font-bold uppercase tracking-wide flex items-center gap-2">
                                <Tag className="w-4 h-4" />
                                Price Distribution
                            </h3>
                        </div>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={priceDistData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
                                    <XAxis type="number" hide />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        width={80}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 11, fill: 'currentColor', fontWeight: 600 }}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'currentColor', opacity: 0.1 }}
                                        contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                                        itemStyle={{ color: 'var(--foreground)', fontFamily: 'monospace' }}
                                    />
                                    <Bar dataKey="count" fill="currentColor" radius={[0, 4, 4, 0]} barSize={32}>
                                        {priceDistData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fillOpacity={0.8} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </section>
                </div>

                {/* Recent Drops Column */}
                <div className="lg:col-span-4 space-y-8">
                    {/* Category Distribution */}
                    <section className="bg-background border border-border p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold uppercase tracking-wide flex items-center gap-2">
                                <Tag className="w-4 h-4" />
                                Categories
                            </h3>
                        </div>
                        <div className="h-[200px] w-full relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={categoryData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={70}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {categoryData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="var(--background)" strokeWidth={2} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', borderRadius: '0px' }}
                                        itemStyle={{ color: 'var(--foreground)', fontFamily: 'monospace', fontSize: '10px' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            {/* Center Label */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="text-2xl font-black">{latestDrops.length}</span>
                            </div>
                        </div>
                        {/* Legend */}
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            {categoryData.slice(0, 4).map((entry, index) => (
                                <div key={entry.name} className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground uppercase">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                    <span>{entry.name}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold uppercase tracking-wide flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                Just Dropped
                            </h3>
                            <Link href="#" className="text-xs font-mono underline hover:text-muted-foreground transition-colors">
                                View All
                            </Link>
                        </div>

                        <div className="space-y-4">
                            {summaryDrops.map((drop, i) => (
                                <motion.div
                                    key={drop.id}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="group relative bg-background border border-border hover:border-foreground/50 transition-colors p-3 flex gap-4"
                                >
                                    <div className="w-20 h-24 bg-muted shrink-0 relative overflow-hidden">
                                        <ImageWithLoading
                                            src={drop.image_url}
                                            alt={drop.title}
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        />
                                    </div>

                                    <div className="flex flex-col justify-between flex-grow min-w-0 py-1">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className={`text-[9px] px-1.5 py-0.5 font-bold tracking-wider uppercase ${CHANGE_TYPE_CONFIG[drop.change_type]?.color || 'bg-gray-500 text-white'}`}>
                                                    {CHANGE_TYPE_CONFIG[drop.change_type]?.label || 'UPDATE'}
                                                </span>
                                                <span className="text-[10px] font-mono text-muted-foreground uppercase">
                                                    {formatDate(drop.detected_at)}
                                                </span>
                                            </div>
                                            <h4 className="font-bold text-sm leading-tight uppercase line-clamp-2 mb-1">
                                                {drop.title}
                                            </h4>
                                            <p className="text-sm font-mono text-muted-foreground">
                                                {formatPrice(drop.price, drop.currency)}
                                            </p>
                                        </div>

                                        <a
                                            href={drop.product_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 hover:underline underline-offset-4 w-fit"
                                        >
                                            View Product <ArrowUpRight className="w-3 h-3" />
                                        </a>
                                    </div>
                                </motion.div>
                            ))}

                            {summaryDrops.length === 0 && (
                                <div className="text-center py-12 border border-border border-dashed text-muted-foreground">
                                    <p className="text-sm">No recent activity</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Quick Stats Summary */}
                    <section className="mt-8 grid grid-cols-2 gap-4">
                        <div className="bg-muted/30 p-4 border border-border">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Total</p>
                            <p className="text-2xl font-bold">{latestDrops.length}</p>
                        </div>
                        <div className="bg-muted/30 p-4 border border-border">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Trend</p>
                            <div className="flex items-center gap-2 text-green-600">
                                <TrendingUp className="w-4 h-4" />
                                <span className="text-sm font-bold">+12%</span>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    )
}
