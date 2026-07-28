"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { User, Heart, Home, ShoppingBag, Users, LayoutGrid } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { ThemeToggle } from "@/components/ui/theme-toggle"

interface HeaderProps {
    /** Page-specific actions rendered before the default actions (e.g. search) */
    actions?: ReactNode
}

const NAV_LINKS = [
    { href: "/shop", label: "Shop" },
    { href: "/community", label: "Community" },
    { href: "/dashboard", label: "Dashboard" },
]

/**
 * Fixed top navigation, shared by every page.
 * Height is 48px — offset page content with `pt-12` (plus breathing room).
 */
export function Header({ actions }: HeaderProps) {
    const pathname = usePathname()
    const { user } = useAuth()

    const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")

    return (
        <>
            <header className="fixed top-0 left-0 right-0 z-50 h-12 bg-background/80 backdrop-blur-xl border-b border-border">
                <div className="mx-auto max-w-6xl h-full px-4 sm:px-6 flex items-center justify-between gap-4">
                    {/* Wordmark */}
                    <Link href="/" className="flex items-center gap-1.5 shrink-0">
                        <span className="font-display text-[15px] font-semibold tracking-tight">It Dropped</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-signal mt-px" aria-hidden />
                    </Link>

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
                        <ThemeToggle />
                        {user ? (
                            <>
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
                        { href: "/shop", label: "Shop", icon: ShoppingBag, active: isActive("/shop") },
                        { href: "/community", label: "Forum", icon: Users, active: isActive("/community") },
                        { href: "/dashboard", label: "Stats", icon: LayoutGrid, active: isActive("/dashboard") },
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
