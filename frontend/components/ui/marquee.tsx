import type { ReactNode } from "react"

interface MarqueeProps {
  items: ReactNode[]
  /** seconds for one full loop */
  duration?: number
  reverse?: boolean
  className?: string
  separator?: ReactNode
}

/**
 * Infinite horizontal ticker. Renders the item set twice so the
 * -50% keyframe loop is seamless. Pauses on hover.
 */
export function Marquee({
  items,
  duration = 40,
  reverse = false,
  className = "",
  separator,
}: MarqueeProps) {
  const sep = separator ?? <span aria-hidden className="px-4 text-signal">✱</span>

  const Group = ({ hidden = false }: { hidden?: boolean }) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden}>
      {items.map((item, i) => (
        <span key={i} className="flex items-center">
          {item}
          {sep}
        </span>
      ))}
    </div>
  )

  return (
    <div
      className={`marquee ${reverse ? "marquee--reverse" : ""} ${className}`}
      style={{ ["--marquee-duration" as string]: `${duration}s` }}
    >
      <div className="marquee__track">
        <Group />
        <Group hidden />
      </div>
    </div>
  )
}
