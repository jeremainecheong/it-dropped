import { LogoMark } from "@/components/ui/logo"

export default function Loading() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
      <LogoMark className="w-6 h-6 animate-pulse-soft" />
      <span className="text-[13px] text-muted-foreground">Loading…</span>
    </div>
  )
}
