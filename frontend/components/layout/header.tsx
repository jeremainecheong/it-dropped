"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { User, Heart, Home, ShoppingBag, Sparkles, Search } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { Logo } from "@/components/ui/logo"
import { SearchOverlay } from "@/components/ui/search-overlay"
import { NotificationBell } from "@/components/ui/notification-bell"

interface HeaderProps {
    /** Page-specific actions rendered before the default actions */
    actions?: ReactNode
}

const NAV_LINKS = [
    { href: "/drops", label: "Drops" },
    { href: "/shop", label: "Shop" },
    { href: "/community", label: "Community" },
    { href: "/dashboard", label: "Dashboard" },
]

/**
 * Fixed top navigation, shared by every page.
 * Height is 48px — offset page content with `pt-12` (plus breathing room).
 * Owns the global search overlay, opened by the button or ⌘K / Ctrl+K.
 */
export function Header({ actions }: HeaderProps) {
    const pathname = usePathname()
    const { user, isLoading } = useAuth()
    const [searchOpen, setSearchOpen] = useState(false)

    const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")

    useEffect(() => {
        const isTypingTarget = (el: EventTarget | null) => {
            const node = el as HTMLElement | null
            if (!node) return false
            const tag = node.tagName
            return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable
        }

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() !== "k") return
            // Ctrl+K is "kill to end of line" on macOS text fields, and any
            // shortcut should stay out of the way while the user is typing.
            if (isTypingTarget(e.target)) return

            const isMac = navigator.platform.toLowerCase().includes("mac")
            const chord = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
            if (!chord) return

            e.preventDefault()
            setSearchOpen((open) => !open)
        }

        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [])

    return (
        <>
            <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

            <header className="fixed top-0 left-0 right-0 z-50 h-12 bg-background/80 backdrop-blur-xl border-b border-border">
                <div className="mx-auto max-w-6xl h-full px-4 sm:px-6 flex items-center justify-between gap-4">
                    {/* Logo */}
                    <Logo size="sm" />

                    {/* Center nav */}
                    <nav className="hidden md:flex items-center gap-7 absolute left-1/2 -translate-x-1/2">
                        {NAV_LINKS.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`text-[13px] transition-colors ${
                                    isActive(link.href)
                                        ? "text-foreground font-medium"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                        {actions}

                        {/* Compact search trigger (mobile) */}
                        <button
                            onClick={() => setSearchOpen(true)}
                            aria-label="Search"
                            className="sm:hidden flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <Search className="w-4 h-4" />
                        </button>

                        {/* Search field affordance (desktop) */}
                        <button
                            onClick={() => setSearchOpen(true)}
                            className="hidden sm:flex items-center gap-2 pl-3 pr-2 py-1.5 mr-1 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <Search className="w-3.5 h-3.5" />
                            <span className="text-[13px]">Search</span>
                            <kbd className="text-[10px] font-medium bg-background/80 rounded px-1.5 py-0.5 leading-none">⌘K</kbd>
                        </button>

                        <ThemeToggle />
                        {/* Held until the session resolves. Rendering the
                            signed-out branch while `getSession()` is still in
                            flight meant every signed-in visitor saw a "Sign In"
                            button flash on 100% of page loads. */}
                        {isLoading ? (
                            <div className="w-8 h-8" aria-hidden />
                        ) : user ? (
                            <>
                                <NotificationBell />
                                <Link
                                    href="/wishlist"
                                    aria-label="Wishlist"
                                    className={`hidden sm:flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                                        isActive("/wishlist") ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    <Heart className="w-4 h-4" />
                                </Link>
                                <Link
                                    href="/profile"
                                    className="pill flex items-center gap-1.5 pl-2.5 pr-3.5 py-1.5 bg-secondary text-[13px] font-medium hover:bg-border ml-1"
                                >
                                    <User className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">{user.name?.split(" ")[0] || "Profile"}</span>
                                </Link>
                            </>
                        ) : (
                            <Link
                                href="/login"
                                className="pill flex items-center px-4 py-1.5 bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-85 ml-1"
                            >
                                Sign In
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            {/* Mobile bottom navigation */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-t border-border pb-safe">
                <div className="flex items-center justify-around h-14">
                    {[
                        { href: "/", label: "Home", icon: Home, active: pathname === "/" },
                        { href: "/drops", label: "Drops", icon: Sparkles, active: isActive("/drops") },
                        { href: "/shop", label: "Shop", icon: ShoppingBag, active: isActive("/shop") },
                        // Was the forum, which is frozen and needs other
                        // people to be worth anything. The wishlist is the
                        // surface this tool exists for and had no mobile entry
                        // at all.
                        { href: "/wishlist", label: "Saved", icon: Heart, active: isActive("/wishlist") },
                        {
                            href: user ? "/profile" : "/login",
                            label: user ? "Profile" : "Login",
                            icon: User,
                            active: isActive("/profile") || isActive("/login"),
                        },
                    ].map((item) => (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors ${
                                item.active ? "text-foreground" : "text-muted-foreground"
                            }`}
                        >
                            <item.icon className="w-5 h-5" strokeWidth={item.active ? 2.2 : 1.8} />
                            <span className="text-[10px] font-medium">{item.label}</span>
                        </Link>
                    ))}
                </div>
            </nav>
        </>
    )
}
