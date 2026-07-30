"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

interface ImageWithLoadingProps {
  src: string
  alt: string
  className?: string
  placeholder?: string
  onLoad?: () => void
}

/**
 * An image that fades in, with a placeholder while it loads.
 *
 * The sizing is the subtle part. Callers pass `className` as "w-full h-full
 * object-cover" and expect it to fill an `aspect-[3/4]` tile. That only works
 * if the *wrapper* is the full-size box: previously `className` went to the
 * `<img>` and to the placeholder but never to the wrapper, so the wrapper was a
 * plain block of indefinite height, the image's `h-full` resolved against
 * nothing and computed to `auto`, and `object-cover` never engaged. A square
 * product shot in a 3:4 tile therefore left a grey band under every card.
 *
 * The placeholder had the same cause and a worse symptom: `absolute inset-0` of
 * a zero-height wrapper is zero-height, so the shimmer and spinner this
 * component exists to show have never once been visible.
 */
export function ImageWithLoading({
  src,
  alt,
  className,
  // Must name a file that actually ships in public/. The previous default
  // pointed at an asset that does not exist, so a failed image fell back to a
  // second 404 and still rendered as a broken icon.
  placeholder = "/placeholder.svg",
  onLoad,
}: ImageWithLoadingProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const handleLoad = () => {
    setIsLoading(false)
    onLoad?.()
  }

  const handleError = () => {
    setIsLoading(false)
    setHasError(true)
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Tokens, not raw palette values: the previous bg-gray-200 /
          border-gray-300 flashed a light grey block in dark mode. */}
      {isLoading && (
        <div className="absolute inset-0 bg-secondary animate-pulse flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-border border-t-muted-foreground rounded-full animate-spin" />
        </div>
      )}

      <img
        src={hasError ? placeholder : src}
        alt={alt}
        className={cn(
          "w-full h-full object-cover transition-all duration-500",
          isLoading ? "opacity-0 scale-105" : "opacity-100 scale-100",
        )}
        onLoad={handleLoad}
        onError={handleError}
        loading="lazy"
      />
    </div>
  )
}
