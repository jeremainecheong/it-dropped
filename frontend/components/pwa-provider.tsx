"use client"

import { useServiceWorker } from "@/hooks/use-service-worker"

export function PWAProvider() {
    useServiceWorker()
    return null
}
