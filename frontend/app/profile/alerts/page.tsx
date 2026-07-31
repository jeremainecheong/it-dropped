"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Bell, Trash2, RefreshCw } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { AuthGuard } from "@/components/auth-guard"
import { Header } from "@/components/layout/header"

const REGION_NAMES: Record<string, string> = {
    us: "the US",
    uk: "the UK",
    eu: "Europe",
    jp: "Japan",
    au: "Australia",
    sg: "Singapore",
}

/**
 * Alerts come from two tables with genuinely different shapes. Price and
 * restock alerts point at a products row; region alerts deliberately do not,
 * because the listing they wait for does not exist yet. They are normalised
 * here so the list can render and manage both.
 */
interface Alert {
    id: string
    /** Which table this row lives in — decides where toggle/delete write. */
    source: "price" | "region"
    label: string
    title: string
    imageUrl?: string
    /** Absent for region alerts: there is nothing to link to yet. */
    productId?: string
    detail: string
    is_active: boolean
    triggered: boolean
    created_at: string
}

const TABLE: Record<Alert["source"], string> = {
    price: "price_alerts",
    region: "region_alerts",
}

/** Region alerts have no listing to link to, so they render as plain text. */
function MaybeLink({ productId, children }: { productId?: string; children: React.ReactNode }) {
    if (!productId) return <>{children}</>
    return <Link href={`/product/${productId}`}>{children}</Link>
}

function AlertsContent() {
    const { user } = useAuth()
    const [alerts, setAlerts] = useState<Alert[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (user) fetchAlerts()
    }, [user])

    const formatPrice = (price: number, currency: string) => {
        const symbols: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", JPY: "¥", AUD: "A$", SGD: "S$" }
        return `${symbols[currency] || currency}${price.toFixed(currency === "JPY" ? 0 : 2)}`
    }

    const formatDate = (dateString: string) =>
        new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric" })

    const fetchAlerts = async () => {
        if (!user) return
        setIsLoading(true)

        const [priceRes, regionRes] = await Promise.all([
            supabase
                .from("price_alerts")
                .select(`*, product:products(title, image_url, price, currency)`)
                .eq("user_id", user.id),
            supabase.from("region_alerts").select("*").eq("user_id", user.id),
        ])

        const priceAlerts: Alert[] = (priceRes.data ?? []).map((a: any) => ({
            id: a.id,
            source: "price",
            label:
                a.alert_type === "price_drop"
                    ? "Price drop"
                    : a.alert_type === "restock"
                      ? "Restock"
                      : "Any change",
            title: a.product?.title || "Unknown product",
            imageUrl: a.product?.image_url,
            productId: a.product_id,
            detail:
                a.alert_type === "price_drop" && a.product
                    ? `Target ${formatPrice(a.target_price, a.product.currency)} / now ${formatPrice(a.product.price, a.product.currency)}`
                    : `Set ${formatDate(a.created_at)}`,
            is_active: a.is_active,
            triggered: a.triggered,
            created_at: a.created_at,
        }))

        const regionAlerts: Alert[] = (regionRes.data ?? []).map((a: any) => ({
            id: a.id,
            source: "region",
            label: "Region launch",
            title: a.title || a.style_code,
            imageUrl: a.image_url ?? undefined,
            detail: `Waiting for a release in ${REGION_NAMES[a.region] || a.region.toUpperCase()}`,
            is_active: a.is_active,
            triggered: a.triggered,
            created_at: a.created_at,
        }))

        setAlerts(
            [...priceAlerts, ...regionAlerts].sort((a, b) =>
                b.created_at.localeCompare(a.created_at)
            )
        )
        setIsLoading(false)
    }

    const toggleAlert = async (alert: Alert) => {
        await supabase
            .from(TABLE[alert.source])
            .update({ is_active: !alert.is_active })
            .eq("id", alert.id)
        setAlerts((prev) =>
            prev.map((a) => (a.id === alert.id ? { ...a, is_active: !a.is_active } : a))
        )
    }

    const deleteAlert = async (alert: Alert) => {
        await supabase.from(TABLE[alert.source]).delete().eq("id", alert.id)
        setAlerts((prev) => prev.filter((a) => a.id !== alert.id))
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Header
                actions={
                    <button onClick={fetchAlerts} aria-label="Refresh alerts" className="btn btn-ghost btn-icon">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                }
            />

            <main id="main" className="pt-14 pb-nav">
                <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8">
                    <div className="flex items-center gap-3 mb-3">
                        <Bell className="w-6 h-6" />
                        <h1 className="text-2xl font-medium">Alerts</h1>
                    </div>
                    <div className="hairline-signal mb-8" />

                    {isLoading ? (
                        <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="rounded-2xl bg-secondary p-4 animate-pulse">
                                    <div className="flex gap-4">
                                        <div className="w-16 h-20 rounded-lg bg-muted" />
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
                            <Link href="/shop" className="btn btn-primary">
                                Browse Products
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {alerts.map((alert, index) => (
                                <div
                                    key={alert.id}
                                    className="rounded-2xl bg-secondary p-4 animate-rise"
                                    // "both" so a delayed card holds the from-state instead
                                    // of flashing in before its turn.
                                    style={{ animationDelay: `${Math.min(index * 40, 200)}ms`, animationFillMode: "both" }}
                                >
                                    {/* Dimming lives a level below animate-rise — the
                                        animation's fill pins the card's own opacity at 1. */}
                                    <div className={`flex gap-4 transition-opacity ${alert.is_active ? "" : "opacity-60"}`}>
                                        {alert.imageUrl && (
                                            <MaybeLink productId={alert.productId}>
                                                <img
                                                    src={alert.imageUrl}
                                                    alt=""
                                                    className="w-16 h-20 rounded-lg object-cover bg-muted"
                                                />
                                            </MaybeLink>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <MaybeLink productId={alert.productId}>
                                                <span
                                                    className={`text-sm font-medium line-clamp-1 ${alert.productId ? "hover:underline" : ""}`}
                                                >
                                                    {alert.title}
                                                </span>
                                            </MaybeLink>
                                            <div className="flex items-center gap-2 mt-1">
                                                {/* bg-background, not bg-muted: muted and the
                                                    card surface are the same token. */}
                                                <span className="pill px-2.5 py-0.5 bg-background text-xs">{alert.label}</span>
                                                {alert.triggered && (
                                                    <span className="pill px-2.5 py-0.5 bg-green-500/10 text-green-600 text-xs">
                                                        Triggered
                                                    </span>
                                                )}
                                            </div>
                                            <p className="num text-xs text-muted-foreground mt-2">{alert.detail}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <button
                                                onClick={() => toggleAlert(alert)}
                                                className={`chip ${alert.is_active ? "chip-on" : ""}`}
                                            >
                                                {alert.is_active ? "Active" : "Paused"}
                                            </button>
                                            {/* Bare .btn, no variant: variant colours are unlayered
                                                CSS and would beat the destructive utilities. */}
                                            <button
                                                onClick={() => deleteAlert(alert)}
                                                aria-label="Delete alert"
                                                className="btn btn-icon text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
