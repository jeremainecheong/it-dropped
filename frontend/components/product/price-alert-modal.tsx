"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { X, Bell, Check, Loader2 } from "lucide-react"
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

interface ExistingAlert {
    target_price: number
    is_active: boolean
}

const ALERT_OPTIONS: { type: AlertType; label: string }[] = [
    { type: "price_drop", label: "Price drop" },
    { type: "restock", label: "Restock" },
    { type: "any_change", label: "Any change" },
]

const defaultTarget = (currentPrice: number) => Math.max(1, Math.floor(currentPrice * 0.9))

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
    const [targetPrice, setTargetPrice] = useState(defaultTarget(currentPrice))
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState("")
    /** Alerts already saved for this product, keyed by alert_type. */
    const [existing, setExisting] = useState<Partial<Record<AlertType, ExistingAlert>>>({})
    const [isLoadingExisting, setIsLoadingExisting] = useState(false)

    // The product page keeps this component mounted and only flips isOpen, so
    // nothing resets on its own: a second open used to show the previous
    // submission's success panel, and the form always defaulted to 90% of the
    // current price even when an alert with a different target already existed
    // — the upsert then overwrote that target without ever showing it.
    useEffect(() => {
        if (!isOpen) return

        setSuccess(false)
        setError("")
        setIsSubmitting(false)
        setAlertType("price_drop")
        setTargetPrice(defaultTarget(currentPrice))
        setExisting({})

        if (!user) return

        let cancelled = false
        setIsLoadingExisting(true)

        supabase
            .from("price_alerts")
            .select("alert_type, target_price, is_active")
            .eq("user_id", user.id)
            .eq("product_id", productId)
            .then(({ data, error: loadError }) => {
                if (cancelled) return
                setIsLoadingExisting(false)
                if (loadError || !data) return

                const found: Partial<Record<AlertType, ExistingAlert>> = {}
                for (const row of data as any[]) {
                    found[row.alert_type as AlertType] = {
                        target_price: Number(row.target_price),
                        is_active: Boolean(row.is_active),
                    }
                }
                setExisting(found)

                // Open on an alert the user already has rather than on the
                // default tab, so an existing target is visible before it can
                // be replaced.
                const preselect = ALERT_OPTIONS.find((o) => found[o.type])
                if (preselect) {
                    setAlertType(preselect.type)
                    setTargetPrice(
                        found[preselect.type]?.target_price ?? defaultTarget(currentPrice)
                    )
                }
            })

        return () => {
            cancelled = true
        }
    }, [isOpen, user, productId, currentPrice])

    const selectType = (type: AlertType) => {
        setAlertType(type)
        setTargetPrice(existing[type]?.target_price ?? defaultTarget(currentPrice))
    }

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
                    // The matcher only considers alerts with triggered = false,
                    // and it sets the flag when it fires. Without clearing it
                    // here, re-saving an alert that has already fired writes a
                    // new target onto a row the matcher will never look at
                    // again — the panel below promises "saving replaces it" and
                    // "saving re-activates it", and neither was true.
                    triggered: false,
                    triggered_at: null,
                },
                { onConflict: "user_id,product_id,alert_type" }
            )

            if (dbError) throw dbError

            setExisting((prev) => ({
                ...prev,
                [alertType]: {
                    target_price: alertType === "price_drop" ? targetPrice : currentPrice,
                    is_active: true,
                },
            }))
            setSuccess(true)
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

    const current = existing[alertType]

    return (
        <>
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" onClick={onClose} />
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-card rounded-3xl shadow-2xl z-50 animate-rise">
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4" />
                        <span className="text-[15px] font-semibold">Set alert</span>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="btn btn-ghost btn-icon">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4">
                    <div>
                        <p className="text-sm font-medium mb-1 line-clamp-1">{productName}</p>
                        <p className="text-[13px] text-muted-foreground">
                            Current price: <span className="num">{formatPrice(currentPrice)}</span>
                        </p>
                    </div>

                    {error && (
                        <div className="rounded-xl bg-destructive/10 px-4 py-3 text-destructive text-[13px]">
                            {error}
                        </div>
                    )}

                    {!user ? (
                        // Submitting used to `return` silently for signed-out users,
                        // leaving the form looking functional. Match the sign-in
                        // prompt region-alert-card.tsx already shows.
                        <div className="py-6 text-center">
                            <p className="text-[13px] text-muted-foreground mb-4">
                                Alerts are tied to your account.
                            </p>
                            <Link href="/login" className="btn btn-primary btn-sm">
                                Sign in to get notified
                            </Link>
                        </div>
                    ) : success ? (
                        <div className="py-6 text-center">
                            <Check className="w-10 h-10 mx-auto mb-4" strokeWidth={1.5} />
                            <p className="text-[15px] font-semibold">Alert set</p>
                            <p className="text-[13px] text-muted-foreground mt-1">
                                We&apos;ll notify you the moment it happens.
                            </p>
                            <div className="mt-5 flex items-center justify-center gap-2">
                                <Link
                                    href="/profile/alerts"
                                    onClick={onClose}
                                    className="btn btn-primary btn-sm"
                                >
                                    View your alerts
                                </Link>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="btn btn-secondary btn-sm"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="label block mb-2">
                                    Alert Type
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {ALERT_OPTIONS.map((option) => (
                                        <button
                                            key={option.type}
                                            type="button"
                                            onClick={() => selectType(option.type)}
                                            aria-label={
                                                existing[option.type]
                                                    ? `${option.label} (alert already set)`
                                                    : option.label
                                            }
                                            className={`chip justify-center ${
                                                alertType === option.type ? "chip-on" : ""
                                            }`}
                                        >
                                            {option.label}
                                            {existing[option.type] && (
                                                <span aria-hidden className="ml-1 text-[10px] align-middle">
                                                    ●
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {isLoadingExisting && (
                                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Checking your existing alerts…
                                </p>
                            )}

                            {current && (
                                <div className="num rounded-xl bg-secondary px-4 py-3 text-[13px]">
                                    <p className="font-medium">
                                        You already have this alert
                                        {current.is_active ? "" : " (paused)"}.
                                    </p>
                                    <p className="text-muted-foreground mt-1">
                                        {alertType === "price_drop"
                                            ? `Current target ${formatPrice(current.target_price)}. Saving replaces it.`
                                            : "Saving re-activates it."}{" "}
                                        <Link href="/profile/alerts" className="underline hover:no-underline">
                                            Manage alerts
                                        </Link>
                                    </p>
                                </div>
                            )}

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
                                        className="num w-full px-4 py-3 bg-secondary rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 transition-shadow"
                                    />
                                    <p className="num text-xs text-muted-foreground mt-1">
                                        Alert when price drops to {formatPrice(targetPrice)} or below
                                    </p>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isSubmitting || isLoadingExisting}
                                className="btn btn-primary btn-lg w-full"
                            >
                                {isSubmitting
                                    ? "Saving..."
                                    : current
                                      ? "Update Alert"
                                      : "Set Alert"}
                            </button>
                        </>
                    )}
                </form>
            </div>
        </>
    )
}
