"use client"

import { useState } from "react"
import { X, Bell, Check } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"

interface PriceAlertModalProps {
    isOpen: boolean
    onClose: () => void
    productId: string
    productName: string
    currentPrice: number
    currency: string
}

type AlertType = "price_drop" | "any_change" | "restock"

export function PriceAlertModal({
    isOpen,
    onClose,
    productId,
    productName,
    currentPrice,
    currency,
}: PriceAlertModalProps) {
    const { user } = useAuth()
    const [alertType, setAlertType] = useState<AlertType>("price_drop")
    const [targetPrice, setTargetPrice] = useState(Math.floor(currentPrice * 0.9))
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState("")

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user) return

        setIsSubmitting(true)
        setError("")

        try {
            const { error: dbError } = await supabase.from("price_alerts").upsert(
                {
                    user_id: user.id,
                    product_id: productId,
                    target_price: alertType === "price_drop" ? targetPrice : currentPrice,
                    alert_type: alertType,
                    is_active: true,
                },
                { onConflict: "user_id,product_id,alert_type" }
            )

            if (dbError) throw dbError

            setSuccess(true)
            setTimeout(() => {
                onClose()
                setSuccess(false)
            }, 1500)
        } catch (err: any) {
            setError(err.message || "Failed to set alert")
        } finally {
            setIsSubmitting(false)
        }
    }

    const formatPrice = (price: number) => {
        const symbols: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", JPY: "¥", AUD: "A$", SGD: "S$" }
        return `${symbols[currency] || currency}${price.toFixed(currency === "JPY" ? 0 : 2)}`
    }

    if (!isOpen) return null

    return (
        <>
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" onClick={onClose} />
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-card rounded-3xl shadow-2xl z-50 animate-rise">
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4" />
                        <span className="text-[15px] font-semibold">Set alert</span>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="pill w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4">
                    <div>
                        <p className="text-sm font-medium mb-1 line-clamp-1">{productName}</p>
                        <p className="text-[13px] text-muted-foreground">
                            Current price: {formatPrice(currentPrice)}
                        </p>
                    </div>

                    {error && (
                        <div className="rounded-xl bg-destructive/10 px-4 py-3 text-destructive text-[13px]">
                            {error}
                        </div>
                    )}

                    {success ? (
                        <div className="py-8 text-center">
                            <Check className="w-10 h-10 mx-auto mb-4" strokeWidth={1.5} />
                            <p className="text-[15px] font-semibold">Alert set</p>
                            <p className="text-[13px] text-muted-foreground mt-1">We&apos;ll notify you the moment it happens.</p>
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="label block mb-2">
                                    Alert Type
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { type: "price_drop" as AlertType, label: "Price drop" },
                                        { type: "restock" as AlertType, label: "Restock" },
                                        { type: "any_change" as AlertType, label: "Any change" },
                                    ].map((option) => (
                                        <button
                                            key={option.type}
                                            type="button"
                                            onClick={() => setAlertType(option.type)}
                                            className={`pill py-2 text-xs font-medium transition-colors ${alertType === option.type
                                                    ? "bg-primary text-primary-foreground"
                                                    : "bg-secondary text-muted-foreground hover:text-foreground"
                                                }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {alertType === "price_drop" && (
                                <div>
                                    <label className="label block mb-2">
                                        Target price ({currency})
                                    </label>
                                    <input
                                        type="number"
                                        value={targetPrice}
                                        onChange={(e) => setTargetPrice(Number(e.target.value))}
                                        max={currentPrice - 1}
                                        min={1}
                                        step={1}
                                        className="w-full px-4 py-3 bg-secondary rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 transition-shadow"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Alert when price drops to {formatPrice(targetPrice)} or below
                                    </p>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="pill w-full py-3 bg-primary text-primary-foreground text-sm font-medium hover:opacity-85 disabled:opacity-50"
                            >
                                {isSubmitting ? "Setting..." : "Set Alert"}
                            </button>
                        </>
                    )}
                </form>
            </div>
        </>
    )
}
