"use client"

import { useState } from "react"
import { Share2, Check, Copy } from "lucide-react"

interface ShareButtonProps {
    url: string
    title: string
    className?: string
}

export function ShareButton({ url, title, className = "" }: ShareButtonProps) {
    const [copied, setCopied] = useState(false)

    const handleShare = async () => {
        const shareData = {
            title: `${title} | IT DROPPED`,
            text: `Check out ${title} on IT DROPPED!`,
            url,
        }

        // Try native share first (mobile)
        if (navigator.share && navigator.canShare?.(shareData)) {
            try {
                await navigator.share(shareData)
                return
            } catch (err) {
                // User cancelled or error - fall through to clipboard
                if ((err as Error).name === "AbortError") return
            }
        }

        // Fallback to clipboard
        try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error("Failed to copy:", err)
        }
    }

    return (
        <button
            onClick={handleShare}
            className={`flex items-center justify-center transition-all ${className}`}
            aria-label={copied ? "Copied!" : "Share"}
            title={copied ? "Copied!" : "Share"}
        >
            {copied ? (
                <Check className="w-4 h-4 text-green-500" />
            ) : (
                <Share2 className="w-4 h-4" />
            )}
        </button>
    )
}
