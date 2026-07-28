import Link from "next/link"

/**
 * It Dropped brand mark — a falling drop with a radar blip.
 * Monochrome drop inherits currentColor; the blip stays signal red.
 */
export function LogoMark({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      {/* motion tick above the drop */}
      <path
        d="M12 1.6v2.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* the drop */}
      <path
        d="M12 5.4C12 5.4 5.4 12.2 5.4 16.4a6.6 6.6 0 0 0 13.2 0C18.6 12.2 12 5.4 12 5.4Z"
        fill="currentColor"
      />
      {/* radar blip */}
      <circle cx="12" cy="16.1" r="2.5" fill="var(--signal)" />
    </svg>
  )
}

interface LogoProps {
  /** wordmark size */
  size?: "sm" | "md" | "lg"
  /** wrap in a link to home (default true) */
  asLink?: boolean
  className?: string
}

const SIZES = {
  sm: { mark: "w-[18px] h-[18px]", text: "text-[15px]" },
  md: { mark: "w-6 h-6", text: "text-lg" },
  lg: { mark: "w-8 h-8", text: "text-2xl" },
}

/** Full lockup: mark + wordmark. */
export function Logo({ size = "sm", asLink = true, className = "" }: LogoProps) {
  const s = SIZES[size]
  const inner = (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className={s.mark} />
      <span className={`font-display font-semibold tracking-tight leading-none ${s.text}`}>
        It Dropped
      </span>
    </span>
  )

  if (!asLink) return inner
  return (
    <Link href="/" aria-label="It Dropped — home" className="shrink-0">
      {inner}
    </Link>
  )
}
