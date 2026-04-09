"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { useAuth } from "./auth-context"
import { supabase } from "./supabase"

export interface WishlistItem {
    id: string
    name: string
    price: number
    currency: string
    image: string
    url: string
    region: string
    addedAt: string
    selectedSize?: string
    trackGlobal?: boolean
    handle?: string
}

interface WishlistContextType {
    items: WishlistItem[]
    isLoading: boolean
    addItem: (item: Omit<WishlistItem, "addedAt">) => Promise<void>
    updateItem: (id: string, updates: Partial<WishlistItem>) => Promise<void>
    removeItem: (id: string) => Promise<void>
    isInWishlist: (id: string) => boolean
    syncFromLocal: () => Promise<void>
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined)

// Safe localStorage access (client-side only)
function getLocalStorage(key: string): string | null {
    if (typeof window === "undefined") return null
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function setLocalStorage(key: string, value: string): void {
    if (typeof window === "undefined") return
    try {
        localStorage.setItem(key, value)
    } catch {
        // Storage quota exceeded or not available
    }
}

function removeLocalStorage(key: string): void {
    if (typeof window === "undefined") return
    try {
        localStorage.removeItem(key)
    } catch {
        // Not available
    }
}

export function WishlistProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth()
    const [items, setItems] = useState<WishlistItem[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    // Fetch wishlist from Supabase
    const fetchWishlist = useCallback(async () => {
        if (!user) {
            setItems([])
            return
        }

        setIsLoading(true)
        try {
            const { data, error } = await supabase
                .from("wishlists")
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })

            if (error) throw error

            const mappedItems: WishlistItem[] = (data || []).map((row) => ({
                id: row.id,
                name: row.title,
                price: parseFloat(row.price),
                currency: row.currency,
                image: row.image_url || "",
                url: row.product_url || "",
                region: row.region,
                addedAt: row.created_at,
                selectedSize: row.selected_size,
                trackGlobal: row.track_all_regions,
                handle: row.handle,
            }))

            setItems(mappedItems)
        } catch (error) {
            console.error("Error fetching wishlist:", error)
            // Fallback to localStorage (only on client)
            if (isMounted) {
                const saved = getLocalStorage(`itdropped_wishlist_${user.id}`)
                if (saved) {
                    try {
                        setItems(JSON.parse(saved))
                    } catch {
                        // Invalid JSON
                    }
                }
            }
        } finally {
            setIsLoading(false)
        }
    }, [user, isMounted])

    useEffect(() => {
        if (isMounted) {
            fetchWishlist()
        }
    }, [fetchWishlist, isMounted])

    const addItem = async (item: Omit<WishlistItem, "addedAt">) => {
        if (!user) return

        const newItem = { ...item, addedAt: new Date().toISOString() }

        // Optimistic update
        setItems((prev) => [...prev, newItem])

        try {
            const { error } = await supabase.from("wishlists").insert({
                user_id: user.id,
                handle: item.handle || item.id,
                title: item.name,
                price: item.price,
                currency: item.currency,
                image_url: item.image,
                product_url: item.url,
                region: item.region,
                selected_size: item.selectedSize,
                track_all_regions: item.trackGlobal || false,
            })

            if (error) throw error
            await fetchWishlist()
        } catch (error) {
            console.error("Error adding to wishlist:", error)
            setItems((prev) => prev.filter((i) => i.id !== item.id))

            // Fallback to localStorage
            if (isMounted) {
                const saved = getLocalStorage(`itdropped_wishlist_${user.id}`)
                const localItems = saved ? JSON.parse(saved) : []
                setLocalStorage(`itdropped_wishlist_${user.id}`, JSON.stringify([...localItems, newItem]))
            }
        }
    }

    const updateItem = async (id: string, updates: Partial<WishlistItem>) => {
        if (!user) return

        setItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
        )

        try {
            const dbUpdates: Record<string, any> = {}
            if (updates.name) dbUpdates.title = updates.name
            if (updates.price) dbUpdates.price = updates.price
            if (updates.selectedSize !== undefined) dbUpdates.selected_size = updates.selectedSize
            if (updates.trackGlobal !== undefined) dbUpdates.track_all_regions = updates.trackGlobal

            const { error } = await supabase
                .from("wishlists")
                .update(dbUpdates)
                .eq("id", id)
                .eq("user_id", user.id)

            if (error) throw error
        } catch (error) {
            console.error("Error updating wishlist item:", error)
            await fetchWishlist()
        }
    }

    const removeItem = async (id: string) => {
        if (!user) return

        const removedItem = items.find((i) => i.id === id)
        setItems((prev) => prev.filter((item) => item.id !== id))

        try {
            const { error } = await supabase
                .from("wishlists")
                .delete()
                .eq("id", id)
                .eq("user_id", user.id)

            if (error) throw error
        } catch (error) {
            console.error("Error removing from wishlist:", error)
            if (removedItem) {
                setItems((prev) => [...prev, removedItem])
            }
        }
    }

    const isInWishlist = (id: string) => items.some((item) => item.id === id || item.handle === id)

    const syncFromLocal = async () => {
        if (!user || !isMounted) return

        const saved = getLocalStorage(`itdropped_wishlist_${user.id}`)
        if (!saved) return

        let localItems: WishlistItem[]
        try {
            localItems = JSON.parse(saved)
        } catch {
            return
        }
        if (localItems.length === 0) return

        setIsLoading(true)
        try {
            for (const item of localItems) {
                await supabase.from("wishlists").upsert({
                    user_id: user.id,
                    handle: item.handle || item.id,
                    title: item.name,
                    price: item.price,
                    currency: item.currency,
                    image_url: item.image,
                    product_url: item.url,
                    region: item.region,
                    selected_size: item.selectedSize,
                    track_all_regions: item.trackGlobal || false,
                }, {
                    onConflict: "user_id,handle,region"
                })
            }

            removeLocalStorage(`itdropped_wishlist_${user.id}`)
            await fetchWishlist()
        } catch (error) {
            console.error("Error syncing wishlist:", error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <WishlistContext.Provider
            value={{ items, isLoading, addItem, updateItem, removeItem, isInWishlist, syncFromLocal }}
        >
            {children}
        </WishlistContext.Provider>
    )
}

export function useWishlist() {
    const context = useContext(WishlistContext)
    if (context === undefined) {
        throw new Error("useWishlist must be used within a WishlistProvider")
    }
    return context
}
