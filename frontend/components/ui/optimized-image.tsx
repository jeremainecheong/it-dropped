"use client"

import { useState } from "react"
import Image from "next/image"

interface OptimizedImageProps {
    src: string
    alt: string
    className?: string
    priority?: boolean
    fill?: boolean
    width?: number
    height?: number
}

export function OptimizedImage({
    src,
    alt,
    className = "",
    priority = false,
    fill = false,
    width,
    height,
}: OptimizedImageProps) {
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(false)

    // Handle external URLs (Shopify CDN)
    const isExternal = src.startsWith("http")

    if (error) {
        return (
            <div className={`bg-muted flex items-center justify-center ${className}`}>
                <span className="text-xs text-muted-foreground">No image</span>
            </div>
        )
    }

    return (
        <div className={`relative overflow-hidden ${className}`}>
            {isLoading && (
                <div className="absolute inset-0 bg-muted animate-pulse" />
            )}
            {fill ? (
                <Image
                    src={src}
                    alt={alt}
                    fill
                    className={`object-cover transition-opacity duration-300 ${isLoading ? "opacity-0" : "opacity-100"}`}
                    priority={priority}
                    onLoad={() => setIsLoading(false)}
                    onError={() => setError(true)}
                    unoptimized={isExternal}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
            ) : (
                <Image
                    src={src}
                    alt={alt}
                    width={width || 400}
                    height={height || 500}
                    className={`object-cover transition-opacity duration-300 ${isLoading ? "opacity-0" : "opacity-100"}`}
                    priority={priority}
                    onLoad={() => setIsLoading(false)}
                    onError={() => setError(true)}
                    unoptimized={isExternal}
                />
            )}
        </div>
    )
}
