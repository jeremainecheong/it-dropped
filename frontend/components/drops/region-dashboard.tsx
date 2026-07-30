"use client"

import { useEffect, useState } from "react"
import { Globe, ArrowUpRight } from "lucide-react"

interface RegionStats {
    region: string
    active_drops_24h: number
    total_tracked_items: number
    top_category: string
}

const REGION_NAMES: Record<string, string> = {
    us: "United States",
    uk: "United Kingdom",
    eu: "Europe",
    jp: "Japan",
    au: "Australia",
    sg: "Singapore",
}

export function RegionDashboard() {
    const [stats, setStats] = useState<RegionStats[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        fetchStats()
    }, [])

    const fetchStats = async () => {
        try {
            const response = await fetch("/api/dropradar/stats")
            const data = await response.json()
            if (data.success && Array.isArray(data.data)) {
                setStats(data.data)
            }
        } catch (error) {
            console.error("Error fetching stats:", error)
        } finally {
            setIsLoading(false)
        }
    }

    if (isLoading) return null

    return (
        <div className="border-b border-border py-8 mb-8 overflow-x-auto scrollbar-hide">
            <div className="flex gap-4 md:gap-8 px-4 md:px-0 min-w-max">
                {stats.map((stat) => (
                    <div
                        key={stat.region}
                        className="w-72 bg-background border border-foreground p-5 flex flex-col justify-between group hover:bg-foreground hover:text-background transition-colors duration-300"
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-xl font-bold tracking-tighter uppercase">{stat.region}</h3>
                                <p className="text-xs font-mono uppercase tracking-widest opacity-60 mt-1">
                                    {REGION_NAMES[stat.region]}
                                </p>
                            </div>
                            <Globe className="w-5 h-5 opacity-40 group-hover:opacity-100 transition-opacity" />
                        </div>

                        <div className="space-y-4">
                            <div>
                                <p className="text-4xl font-bold tracking-tighter leading-none">
                                    {stat.active_drops_24h}
                                </p>
                                <p className="text-[10px] uppercase tracking-widest font-bold mt-1 opacity-60">
                                    Active Drops (24h)
                                </p>
                            </div>

                            <div className="h-px bg-current opacity-20" />

                            <div className="flex justify-between items-end">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide truncate max-w-[150px]">
                                        {stat.top_category === "N/A" ? "No Data" : stat.top_category}
                                    </p>
                                    <p className="text-[9px] uppercase tracking-widest opacity-60 mt-0.5">
                                        Top Moving Category
                                    </p>
                                </div>
                                <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
