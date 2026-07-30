"use client"

import { useEffect, useRef, useCallback, useState } from "react"

interface UseInfiniteScrollOptions {
    threshold?: number
    rootMargin?: string
    enabled?: boolean
}

export function useInfiniteScroll(
    onLoadMore: () => void,
    options: UseInfiniteScrollOptions = {}
) {
    const { threshold = 0.1, rootMargin = "200px", enabled = true } = options
    const targetRef = useRef<HTMLDivElement | null>(null)
    const observerRef = useRef<IntersectionObserver | null>(null)

    // Callback ref that handles observer setup
    const setTarget = useCallback(
        (node: HTMLDivElement | null) => {
            // Disconnect previous observer
            if (observerRef.current) {
                observerRef.current.disconnect()
                observerRef.current = null
            }

            targetRef.current = node

            if (!node || !enabled) return

            // Create new observer
            const observer = new IntersectionObserver(
                (entries) => {
                    const [entry] = entries
                    if (entry.isIntersecting) {
                        onLoadMore()
                    }
                },
                { threshold, rootMargin }
            )

            observer.observe(node)
            observerRef.current = observer
        },
        [enabled, threshold, rootMargin, onLoadMore]
    )

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect()
            }
        }
    }, [])

    return setTarget
}
