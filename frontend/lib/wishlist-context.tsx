"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { toast } from "sonner"
import { useAuth } from "./auth-context"
import { supabase } from "./supabase"

export interface WishlistItem {
    /** The PRODUCT id, which is what every call site passes to addItem,
     *  removeItem and isInWishlist. This used to be mapped from the wishlists
     *  row PK, so nothing a caller asked about ever matched. */
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * wishlists.product_id is a UUID column, so a non-UUID sent to it is a 400 for
 * the whole insert rather than a null column. Legacy saves resolve their id
 * from the TEXT handle column, so an id reaching here is not guaranteed to be
 * a product UUID; anything that isn't goes in as NULL and the row still keys
 * off handle, exactly as every existing row already does.
 */
export function asProductId(id: string): string | null {
    return UUID_RE.test(id) ? id : null
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

            // `id` is the product id. Rows written before product_id was
            // populated have it NULL and the product UUID in the NOT NULL
            // handle column, so handle is the fallback that keeps those saves
            // resolvable.
            const mappedItems: WishlistItem[] = (data || []).map((row) => ({
                id: row.product_id ?? row.handle,
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

            // One product can hold two rows — a legacy one keyed on the product
            // UUID as its handle and a newer one keyed on the real handle —
            // because the unique constraint is (user_id, handle, region) and
            // those are different handles. They collapse to the same id here,
            // and rendering both would mean duplicate React keys on /wishlist.
            const seen = new Set<string>()
            const deduped = mappedItems.filter((item) => {
                if (seen.has(item.id)) return false
                seen.add(item.id)
                return true
            })

            setItems(deduped)
        } catch (error) {
            console.error("Error fetching wishlist:", error)
            toast.error("Couldn't load your saved items.")
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
        if (!user) {
            // Signed out, the heart used to do nothing at all — no row, no
            // error, no hint that saving needs an account.
            toast.error("Sign in to save items", {
                action: { label: "Sign in", onClick: () => window.location.assign("/login") },
            })
            return
        }

        // trending-products and search-overlay call addItem without a handle,
        // so the product id is the handle for those saves. Resolving it here
        // rather than only at the insert keeps the optimistic item identical to
        // the row, which is what removeItem keys on before the refetch lands.
        const handle = item.handle || item.id
        const newItem = { ...item, handle, addedAt: new Date().toISOString() }

        // Optimistic update
        setItems((prev) => [...prev, newItem])

        try {
            const { error } = await supabase.from("wishlists").insert({
                user_id: user.id,
                product_id: asProductId(item.id),
                handle,
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
            toast.error("Couldn't save that. It's stored on this device for now.")
            setItems((prev) => prev.filter((i) => i.id !== item.id))

            // Fallback to localStorage
            if (isMounted) {
                const saved = getLocalStorage(`itdropped_wishlist_${user.id}`)
                const localItems = saved ? JSON.parse(saved) : []
                setLocalStorage(`itdropped_wishlist_${user.id}`, JSON.stringify([...localItems, newItem]))
            }
        }
    }

    /**
     * The handles a product id can be stored under, for keying a write on the
     * table's real unique constraint, (user_id, handle, region).
     *
     * Callers pass a product id. The old code fed that straight to
     * .eq("id", …) — the row PK — which matched zero rows for every save the
     * app has ever written, so un-saving outside /wishlist silently failed and
     * came back on reload. Both candidates are TEXT, so there is no UUID parse
     * to fail on, and sending them as one IN list also clears the duplicate
     * legacy/new pair described in fetchWishlist in a single request.
     */
    const handlesFor = (id: string, known?: WishlistItem) =>
        Array.from(new Set([known?.handle, id].filter(Boolean) as string[]))

    const updateItem = async (id: string, updates: Partial<WishlistItem>) => {
        if (!user) return

        const target = items.find((i) => i.id === id || i.handle === id)

        setItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
        )

        try {
            const dbUpdates: Record<string, any> = {}
            if (updates.name) dbUpdates.title = updates.name
            if (updates.price) dbUpdates.price = updates.price
            if (updates.selectedSize !== undefined) dbUpdates.selected_size = updates.selectedSize
            if (updates.trackGlobal !== undefined) dbUpdates.track_all_regions = updates.trackGlobal
            // PostgREST rejects an empty patch body, so an update of fields this
            // function does not map would fail rather than no-op.
            if (Object.keys(dbUpdates).length === 0) return

            let query = supabase
                .from("wishlists")
                .update(dbUpdates)
                .eq("user_id", user.id)
                .in("handle", handlesFor(id, target))
            if (target?.region) query = query.eq("region", target.region)

            const { error } = await query
            if (error) throw error
        } catch (error) {
            console.error("Error updating wishlist item:", error)
            toast.error("Couldn't update that saved item.")
            await fetchWishlist()
        }
    }

    const removeItem = async (id: string) => {
        if (!user) return

        const removedItem = items.find((i) => i.id === id || i.handle === id)
        setItems((prev) => prev.filter((item) => item.id !== id && item.handle !== id))

        try {
            let query = supabase
                .from("wishlists")
                .delete()
                .eq("user_id", user.id)
                .in("handle", handlesFor(id, removedItem))
            if (removedItem?.region) query = query.eq("region", removedItem.region)

            const { error } = await query
            if (error) throw error
        } catch (error) {
            console.error("Error removing from wishlist:", error)
            toast.error("Couldn't remove that. Try again.")
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
                    product_id: asProductId(item.id),
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
            toast.error("Couldn't sync your saved items to your account.")
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
