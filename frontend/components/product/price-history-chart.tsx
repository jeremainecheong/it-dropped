"use client"

import { useState, useEffect } from "react"
import { Line, LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { supabase } from "@/lib/supabase"

interface PriceHistoryChartProps {
    productId: string
    currency: string
}

interface PricePoint {
    date: string
    price: number
}

export function PriceHistoryChart({ productId, currency }: PriceHistoryChartProps) {
    const [data, setData] = useState<PricePoint[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
        fetchPriceHistory()
    }, [productId])

    const fetchPriceHistory = async () => {
        try {
            const { data: history, error } = await supabase
                .from("price_history")
                .select("price, recorded_at")
                .eq("product_id", productId)
                .order("recorded_at", { ascending: true })
                .limit(30)

            if (!error && history) {
                const formatted = history.map((h) => ({
                    date: new Date(h.recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                    price: h.price,
                }))
                setData(formatted)
            }
        } catch (error) {
            console.error("Error:", error)
        } finally {
            setIsLoading(false)
        }
    }

    if (!isMounted || isLoading) {
        return (
            <div className="h-48 bg-muted animate-pulse rounded" />
        )
    }

    if (data.length < 2) {
        return (
            <div className="h-48 bg-muted/50 flex items-center justify-center rounded">
                <p className="text-xs text-muted-foreground">Not enough price data yet</p>
            </div>
        )
    }

    const minPrice = Math.min(...data.map((d) => d.price))
    const maxPrice = Math.max(...data.map((d) => d.price))
    const priceChange = data[data.length - 1].price - data[0].price
    const isDown = priceChange < 0

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Price History</h4>
                <span className={`text-xs font-medium ${isDown ? "text-green-500" : "text-red-500"}`}>
                    {isDown ? "↓" : "↑"} {Math.abs(priceChange).toFixed(2)} {currency}
                </span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
                <LineChart data={data}>
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis
                        domain={[minPrice * 0.95, maxPrice * 1.05]}
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${currency} ${v}`}
                        width={60}
                    />
                    <Tooltip
                        contentStyle={{
                            background: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            fontSize: 12,
                        }}
                        formatter={(value: number) => [`${currency} ${value.toFixed(2)}`, "Price"]}
                    />
                    <Line
                        type="monotone"
                        dataKey="price"
                        stroke="hsl(var(--foreground))"
                        strokeWidth={2}
                        dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}
