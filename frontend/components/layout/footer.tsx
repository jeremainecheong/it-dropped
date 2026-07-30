import Link from "next/link"
import { Logo } from "@/components/ui/logo"

/** Minimal shared footer, used by every page. */
export function Footer() {
  return (
    <footer className="border-t border-border mt-auto">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-8">
          <div>
            <Logo size="md" asLink={false} />
            <p className="text-[13px] text-muted-foreground mt-2 max-w-xs">
              Live Stüssy drop tracking across six regions.
            </p>
          </div>

          <div className="flex gap-14">
            <div className="space-y-2.5">
              <p className="label">Browse</p>
              <ul className="space-y-2 text-[13px] text-muted-foreground">
                <li><Link href="/shop" className="hover:text-foreground transition-colors">Shop</Link></li>
                <li><Link href="/drops" className="hover:text-foreground transition-colors">Drops</Link></li>
                <li><Link href="/wishlist" className="hover:text-foreground transition-colors">Saved</Link></li>
              </ul>
            </div>
            <div className="space-y-2.5">
              <p className="label">Account</p>
              <ul className="space-y-2 text-[13px] text-muted-foreground">
                <li><Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link></li>
                <li><Link href="/profile/alerts" className="hover:text-foreground transition-colors">Alerts</Link></li>
                <li><Link href="/profile" className="hover:text-foreground transition-colors">Profile</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mt-10 pt-6 border-t border-border text-xs text-muted-foreground">
          <span>© 2026 It Dropped. All rights reserved.</span>
          <span>Not affiliated with Stüssy Inc.</span>
        </div>
      </div>
    </footer>
  )
}
