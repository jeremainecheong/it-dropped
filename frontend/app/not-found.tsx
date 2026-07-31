import Link from "next/link"
import { LogoMark } from "@/components/ui/logo"

/**
 * 404.
 *
 * Next's default is an unbranded black-on-white "404 | This page could not be
 * found" with no header, no navigation and no link anywhere. This at least
 * gives a way back.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-5 px-6 text-center">
      <LogoMark className="w-6 h-6" />
      <div className="space-y-3">
        <p className="page-title num">404</p>
        <p className="text-[13px] text-muted-foreground max-w-xs">
          Nothing here. The page may have moved, or a listing may have been delisted
          since the link was made.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Link href="/shop" className="btn btn-primary">
          Browse the catalogue
        </Link>
        <Link href="/drops" className="btn btn-secondary">
          Latest drops
        </Link>
      </div>
    </div>
  )
}
