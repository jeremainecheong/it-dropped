"use client"

import { memo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, ArrowUpRight, Globe } from "lucide-react"
import Link from "next/link"
import { ImageWithLoading } from "@/components/image-with-loading"

interface WishlistItem {
    id: string
    name: string
    price: number
    currency: string
    image: string
    url: string
    region: string
    addedAt: string
    selectedSize?: string
    handle?: string
}

interface WishlistCardProps {
    item: WishlistItem
    onRemove: (id: string) => void
    priority?: boolean
}

const REGION_FLAGS: Record<string, string> = {
    us: "🇺🇸",
    uk: "🇬🇧",
    eu: "🇪🇺",
    jp: "🇯🇵",
    au: "🇦🇺",
    sg: "🇸🇬",
}

// Mock Global Availability (Replace with real API later)
const checkGlobalAvailability = async (handle: string, currentRegion: string) => {
    // Simulate API delay
    await new Promise(r => setTimeout(r, 1000))
    // Mock response
    return ["us", "uk", "eu", "jp", "au", "sg"]
        .filter(r => r !== currentRegion)
        .map(r => ({
            region: r,
            available: Math.random() > 0.5,
            price: Math.floor(Math.random() * 50) + 100
        }))
}

export const WishlistCard = memo(function WishlistCard({ item, onUpdate, onRemove, priority = false }: WishlistCardProps & { onUpdate: (id: string, data: any) => void }) {
    const [checkingGlobal, setCheckingGlobal] = useState(false)
    const [globalData, setGlobalData] = useState<any[] | null>(null)
    const [isGlobalOpen, setIsGlobalOpen] = useState(false)

    const formatPrice = (price: number, currency: string) => {
        const symbols: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", JPY: "¥", AUD: "A$" }
        return `${symbols[currency] || currency}${price.toFixed(currency === "JPY" ? 0 : 2)}`
    }

    const handleCheckGlobal = async () => {
        if (!isGlobalOpen) {
            setIsGlobalOpen(true)
            if (!globalData) {
                setCheckingGlobal(true)
                try {
                    // Use item.handle if available, fallback to mock simulation
                    const data = await checkGlobalAvailability(item.handle || "", item.region)
                    setGlobalData(data)
                } finally {
                    setCheckingGlobal(false)
                }
            }
        } else {
            setIsGlobalOpen(false)
        }
    }

    // Mock sizes if not in item (should come from item in real app)
    const sizes = ["S", "M", "L", "XL", "XXL"]

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="group relative flex flex-col bg-background border border-border hover:border-foreground/50 transition-colors duration-300"
        >
            {/* Quick Remove Button */}
            <button
                onClick={() => onRemove(item.id)}
                className="absolute top-0 right-0 z-20 p-3 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label="Remove from wishlist"
            >
                <X className="w-5 h-5" />
            </button>

            {/* Region Badge */}
            <div className="absolute top-3 left-3 z-20 px-2 py-1 bg-background/90 backdrop-blur-sm border border-border text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 pointer-events-none">
                <span className="text-base">{REGION_FLAGS[item.region] || "🌐"}</span>
                <span>{item.region}</span>
            </div>

            {/* Image Container */}
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="relative aspect-[3/4] overflow-hidden bg-muted block">
                <div className="w-full h-full transition-transform duration-700 ease-[0.16,1,0.3,1] group-hover:scale-105">
                    <ImageWithLoading
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                    />
                </div>

                {/* Hover Overlay */}
                <div className="absolute inset-x-0 bottom-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-[0.16,1,0.3,1]">
                    <div className="bg-foreground text-background py-3.5 px-4 font-bold text-sm uppercase tracking-wide flex items-center justify-center gap-2">
                        Shop Now <ArrowUpRight className="w-4 h-4" />
                    </div>
                </div>
            </a>

            {/* Details */}
            <div className="p-4 flex flex-col gap-3 flex-grow border-t border-border">
                <div className="flex-grow">
                    <h3 className="font-bold text-sm leading-snug line-clamp-2 uppercase tracking-wide mb-1">
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline decoration-1 underline-offset-4">
                            {item.name}
                        </a>
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono">
                        Added {new Date(item.addedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                </div>

                {/* Size Selector */}
                <div className="flex items-center gap-2">
                    <select
                        className="w-full bg-background border border-border text-xs font-bold uppercase py-1.5 px-2 focus:outline-none focus:border-foreground"
                        value={item.selectedSize || ""}
                        onChange={(e) => onUpdate(item.id, { selectedSize: e.target.value })}
                    >
                        <option value="" disabled>Select Size</option>
                        {sizes.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-dashed border-border">
                    <p className="text-lg font-bold font-mono tracking-tight">
                        {formatPrice(item.price, item.currency)}
                    </p>
                    <button
                        onClick={handleCheckGlobal}
                        className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1 transition-colors ${isGlobalOpen ? "text-accent" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        <Globe className="w-3 h-3" />
                        {isGlobalOpen ? "Close Check" : "Global Check"}
                    </button>
                </div>

                {/* Global Availability Panel */}
                <AnimatePresence>
                    {isGlobalOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden border-t border-border pt-2"
                        >
                            {checkingGlobal ? (
                                <div className="py-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                    <div className="w-2 h-2 bg-foreground rounded-full animate-bounce" />
                                    Checking regions...
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2 py-2">
                                    {globalData?.map((data) => (
                                        <div key={data.region} className="flex items-center justify-between text-[10px] uppercase font-bold bg-muted/30 p-1.5 border border-border">
                                            <div className="flex items-center gap-1">
                                                <span>{REGION_FLAGS[data.region]}</span>
                                                <span className={data.available ? "text-green-600" : "text-red-600"}>
                                                    {data.available ? "AVL" : "SOLD"}
                                                </span>
                                            </div>
                                            {data.available && <span>${data.price}</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    )
})
