"use client"

import { MapPin } from "lucide-react"
import { DESTINATIONS } from "@/lib/landed-cost"

interface DestinationSelectProps {
  value: string
  onChange: (code: string) => void
  className?: string
}

/**
 * Where the shopper is buying to. Drives every landed-cost figure, so it sits
 * next to the numbers it changes rather than buried in settings.
 */
export function DestinationSelect({ value, onChange, className = "" }: DestinationSelectProps) {
  return (
    <label
      className={`pill inline-flex items-center gap-1.5 bg-secondary pl-3 pr-2 py-1.5 text-[13px] cursor-pointer ${className}`}
    >
      <MapPin className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.8} />
      <span className="text-muted-foreground">Ship to</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Shipping destination"
        className="bg-transparent font-medium outline-none cursor-pointer pr-1"
      >
        {DESTINATIONS.map((d) => (
          <option key={d.code} value={d.code}>
            {d.name}
          </option>
        ))}
      </select>
    </label>
  )
}
