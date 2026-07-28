"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Bell, Trash2, RefreshCw } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { AuthGuard } from "@/components/auth-guard"
import { Header } from "@/components/layout/header"

interface Alert {
    id: string
    product_id: string
    target_price: number
    alert_type: string
    is_active: boolean
    triggered: boolean
    triggered_at: string | null
    created_at: string
    product?: {
        title: string
        image_url: string
        price: number
        currency: string
    }
}

function AlertsContent() {
    const { user } = useAuth()
    const [alerts, setAlerts] = useState<Alert[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (user) fetchAlerts()
    }, [user])

    const fetchAlerts = async () => {
        if (!user) return
        setIsLoading(true)

        const { data, error } = await supabase
            .from("price_alerts")
            .select(`
                *,
                product:products(title, image_url, price, currency)
            `)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })

        if (!error && data) {
            setAlerts(data)
        }
        setIsLoading(false)
    }

    const toggleAlert = async (id: string, isActive: boolean) => {
        await supabase.from("price_alerts").update({ is_active: !isActive }).eq("id", id)
        setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_active: !isActive } : a)))
    }

    const deleteAlert = async (id: string) => {
        await supabase.from("price_alerts").delete().eq("id", id)
        setAlerts((prev) => prev.filter((a) => a.id !== id))
    }

    const formatPrice = (price: number, currency: string) => {
        const symbols: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", JPY: "¥", AUD: "A$", SGD: "S$" }
        return `${symbols[currency] || currency}${price.toFixed(currency === "JPY" ? 0 : 2)}`
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
        })
    }

    const getAlertTypeLabel = (type: string) => {
        switch (type) {
            case "price_drop":
                return "Price Drop"
            case "restock":
                return "Restock"
            case "any_change":
                return "Any Change"
            default:
                return type
        }
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Header
                actions={
                    <button onClick={fetchAlerts} aria-label="Refresh alerts" className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground transition-colors">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                }
            />

            <main className="pt-14 pb-20 md:pb-8">
                <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8">
                    <div className="flex items-center gap-3 mb-8">
                        <Bell className="w-6 h-6" />
                        <h1 className="text-2xl font-medium">Price Alerts</h1>
                    </div>

                    {isLoading ? (
                        <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="p-4 border border-border animate-pulse">
                                    <div className="flex gap-4">
                                        <div className="w-16 h-20 bg-muted" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-4 bg-muted w-3/4" />
                                            <div className="h-3 bg-muted w-1/2" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : alerts.length === 0 ? (
                        <div className="text-center py-16">
                            <Bell className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                            <p className="text-muted-foreground mb-4">No alerts set</p>
                            <Link href="/shop" className="px-6 py-3 bg-foreground text-background text-sm">
                                Browse Products
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {alerts.map((alert) => (
                                <div
                                    key={alert.id}
                                    className={`border p-4 transition-colors ${alert.is_active ? "border-border" : "border-border/50 opacity-60"
                                        }`}
                                >
                                    <div className="flex gap-4">
                                        {alert.product?.image_url && (
                                            <Link href={`/product/${alert.product_id}`}>
                                                <img
                                                    src={alert.product.image_url}
                                                    alt=""
                                                    className="w-16 h-20 object-cover bg-muted"
                                                />
                                            </Link>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <Link
                                                href={`/product/${alert.product_id}`}
                                                className="text-sm font-medium hover:underline line-clamp-1"
                                            >
                                                {alert.product?.title || "Unknown Product"}
                                            </Link>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="px-2 py-0.5 bg-muted text-xs">
                                                    {getAlertTypeLabel(alert.alert_type)}
                                                </span>
                                                {alert.triggered && (
                                                    <span className="px-2 py-0.5 bg-green-500/10 text-green-600 text-xs">
                                                        Triggered
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-2">
                                                {alert.alert_type === "price_drop" && alert.product && (
                                                    <>
                                                        Target: {formatPrice(alert.target_price, alert.product.currency)}
                                                        {" / "}
                                                        Current: {formatPrice(alert.product.price, alert.product.currency)}
                                                    </>
                                                )}
                                                {alert.alert_type !== "price_drop" && (
                                                    <>Set {formatDate(alert.created_at)}</>
                                                )}
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <button
                                                onClick={() => toggleAlert(alert.id, alert.is_active)}
                                                className={`px-3 py-1 text-xs border transition-colors ${alert.is_active
                                                        ? "border-foreground"
                                                        : "border-border hover:border-foreground"
                                                    }`}
                                            >
                                                {alert.is_active ? "Active" : "Paused"}
                                            </button>
                                            <button
                                                onClick={() => deleteAlert(alert.id)}
                                                className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}

export default function AlertsPage() {
    return (
        <AuthGuard>
            <AlertsContent />
        </AuthGuard>
    )
}
