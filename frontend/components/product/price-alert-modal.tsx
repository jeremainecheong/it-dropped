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
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-background border border-border z-50">
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4" />
                        <span className="text-sm uppercase tracking-widest">Set Alert</span>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-muted rounded">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <p className="text-sm font-medium mb-1 line-clamp-1">{productName}</p>
                        <p className="text-xs text-muted-foreground">
                            Current price: {formatPrice(currentPrice)}
                        </p>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 text-xs">
                            {error}
                        </div>
                    )}

                    {success ? (
                        <div className="py-8 text-center">
                            <Check className="w-12 h-12 mx-auto text-green-500 mb-4" />
                            <p className="text-sm">Alert set successfully</p>
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-2">
                                    Alert Type
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { type: "price_drop" as AlertType, label: "Price Drop" },
                                        { type: "restock" as AlertType, label: "Restock" },
                                        { type: "any_change" as AlertType, label: "Any Change" },
                                    ].map((option) => (
                                        <button
                                            key={option.type}
                                            type="button"
                                            onClick={() => setAlertType(option.type)}
                                            className={`py-2 text-xs uppercase tracking-wide border transition-colors ${alertType === option.type
                                                    ? "bg-foreground text-background border-foreground"
                                                    : "border-border hover:border-foreground"
                                                }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {alertType === "price_drop" && (
                                <div>
                                    <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-2">
                                        Target Price ({currency})
                                    </label>
                                    <input
                                        type="number"
                                        value={targetPrice}
                                        onChange={(e) => setTargetPrice(Number(e.target.value))}
                                        max={currentPrice - 1}
                                        min={1}
                                        step={1}
                                        className="w-full px-3 py-2 bg-background border border-border text-sm focus:border-foreground focus:outline-none"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Alert when price drops to {formatPrice(targetPrice)} or below
                                    </p>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full py-3 bg-foreground text-background text-sm uppercase tracking-wide font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50"
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
