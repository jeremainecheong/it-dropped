"use client"

import { useState, useEffect, useCallback } from "react"

interface PushState {
    isSupported: boolean
    isSubscribed: boolean
    isLoading: boolean
}

export function usePushNotifications() {
    const [state, setState] = useState<PushState>({
        isSupported: false,
        isSubscribed: false,
        isLoading: true,
    })

    useEffect(() => {
        checkSupport()
    }, [])

    const checkSupport = async () => {
        if (typeof window === "undefined") return

        const supported = "serviceWorker" in navigator && "PushManager" in window
        if (!supported) {
            setState({ isSupported: false, isSubscribed: false, isLoading: false })
            return
        }

        try {
            const registration = await navigator.serviceWorker.ready
            const subscription = await registration.pushManager.getSubscription()
            setState({
                isSupported: true,
                isSubscribed: !!subscription,
                isLoading: false,
            })
        } catch {
            setState({ isSupported: true, isSubscribed: false, isLoading: false })
        }
    }

    const subscribe = useCallback(async () => {
        if (!state.isSupported) return false

        try {
            setState((s) => ({ ...s, isLoading: true }))

            const permission = await Notification.requestPermission()
            if (permission !== "granted") {
                setState((s) => ({ ...s, isLoading: false }))
                return false
            }

            const registration = await navigator.serviceWorker.ready

            // You would normally get this from your server
            const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

            if (!publicKey) {
                console.warn("VAPID public key not configured")
                setState((s) => ({ ...s, isLoading: false }))
                return false
            }

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
            })

            // Send subscription to server (you'd implement this endpoint)
            // await fetch("/api/push/subscribe", { 
            //   method: "POST", 
            //   body: JSON.stringify(subscription) 
            // })

            console.log("Push subscription:", subscription)
            setState({ isSupported: true, isSubscribed: true, isLoading: false })
            return true
        } catch (error) {
            console.error("Push subscription error:", error)
            setState((s) => ({ ...s, isLoading: false }))
            return false
        }
    }, [state.isSupported])

    const unsubscribe = useCallback(async () => {
        try {
            setState((s) => ({ ...s, isLoading: true }))

            const registration = await navigator.serviceWorker.ready
            const subscription = await registration.pushManager.getSubscription()

            if (subscription) {
                await subscription.unsubscribe()
            }

            setState({ isSupported: true, isSubscribed: false, isLoading: false })
            return true
        } catch (error) {
            console.error("Push unsubscribe error:", error)
            setState((s) => ({ ...s, isLoading: false }))
            return false
        }
    }, [])

    return {
        ...state,
        subscribe,
        unsubscribe,
    }
}

// Helper to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
}
