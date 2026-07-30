"use client"

import { useState, useEffect, useCallback } from "react"

interface RecentlyViewedItem {
    id: string
    title: string
    price: number
    currency: string
    image: string
    region: string
    viewedAt: number
}

const STORAGE_KEY = "itdropped_recently_viewed"
const MAX_ITEMS = 10

export function useRecentlyViewed() {
    const [items, setItems] = useState<RecentlyViewedItem[]>([])
    const [isLoaded, setIsLoaded] = useState(false)

    useEffect(() => {
        if (typeof window === "undefined") return

        try {
            const stored = localStorage.getItem(STORAGE_KEY)
            if (stored) {
                const parsed = JSON.parse(stored)
                // Filter out items older than 7 days
                const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
                const filtered = parsed.filter((item: RecentlyViewedItem) => item.viewedAt > weekAgo)
                setItems(filtered)
            }
        } catch (error) {
            console.error("Error loading recently viewed:", error)
        }
        setIsLoaded(true)
    }, [])

    useEffect(() => {
        if (!isLoaded || typeof window === "undefined") return

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
        } catch (error) {
            console.error("Error saving recently viewed:", error)
        }
    }, [items, isLoaded])

    const addItem = useCallback((item: Omit<RecentlyViewedItem, "viewedAt">) => {
        setItems((prev) => {
            // Remove if already exists
            const filtered = prev.filter((i) => i.id !== item.id)
            // Add to front with timestamp
            const newItem = { ...item, viewedAt: Date.now() }
            const updated = [newItem, ...filtered].slice(0, MAX_ITEMS)
            return updated
        })
    }, [])

    const removeItem = useCallback((id: string) => {
        setItems((prev) => prev.filter((item) => item.id !== id))
    }, [])

    const clearAll = useCallback(() => {
        setItems([])
    }, [])

    return {
        items,
        addItem,
        removeItem,
        clearAll,
        isLoaded,
    }
}
