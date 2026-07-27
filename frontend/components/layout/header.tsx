"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { User, Heart, Home, ShoppingBag, Users, BarChart3 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { Marquee } from "@/components/ui/marquee"

interface HeaderProps {
    activePage?: "home" | "shop" | "community" | "dashboard" | "profile"
}

const TICKER = [
    "IT DROPPED",
    "SS26 ARCHIVE",
    "6 REGIONS · US / UK / EU / JP / AU / SG",
    "LIVE DROP TRACKING",
    "NEVER MISS A RELEASE",
    "RESTOCK ALERTS",
]

export function Header({ activePage }: HeaderProps) {
    const pathname = usePathname()
    const { user } = useAuth()

    const navLinks = [
        { href: "/shop", label: "Shop", index: "01" },
        { href: "/community", label: "Community", index: "02" },
        { href: "/dashboard", label: "Dashboard", index: "03" },
    ]

    const isActive = (href: string) => {
        if (activePage) return href === `/${activePage}`
        return pathname === href || pathname.startsWith(href + "/")
    }

    return (
        <>
            <div className="fixed top-0 left-0 right-0 z-50">
                {/* Ticker strip */}
                <div className="bg-signal text-signal-foreground border-b border-foreground/10">
                    <Marquee
                        duration={38}
                        className="py-1.5 font-mono text-[10px] uppercase tracking-[0.2em]"
                        items={TICKER.map((t) => (
                            <span key={t}>{t}</span>
                        ))}
                        separator={<span aria-hidden className="px-4 opacity-60">/</span>}
                    />
                </div>

                {/* Main header row */}
                <header className="bg-background/95 backdrop-blur-sm border-b border-foreground">
                    <div className="flex items-stretch justify-between h-14 divide-x divide-border">
                        <Link
                            href="/"
                            className="flex items-center gap-2 px-4 lg:px-6 shrink-0 hover-invert"
                        >
                            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-signal">◉</span>
                            <span className="text-base font-bold tracking-tight uppercase">
                                it&nbsp;dropped
                            </span>
                        </Link>

                        {/* Desktop Nav */}
                        <nav className="hidden md:flex items-stretch divide-x divide-border">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={`group flex items-center gap-2 px-5 transition-colors ${
                                        isActive(link.href)
                                            ? "bg-foreground text-background"
                                            : "hover:bg-foreground hover:text-background"
                                    }`}
                                >
                                    <span
                                        className={`font-mono text-[9px] tracking-widest ${
                                            isActive(link.href)
                                                ? "text-background/60"
                                                : "text-signal group-hover:text-background/60"
                                        }`}
                                    >
                                        {link.index}
                                    </span>
                                    <span className="text-xs uppercase tracking-[0.15em]">{link.label}</span>
                                </Link>
                            ))}
                        </nav>

                        {/* Right Actions */}
                        <div className="ml-auto flex items-stretch divide-x divide-border">
                            <div className="flex items-center px-3">
                                <ThemeToggle />
                            </div>

                            {user ? (
                                <>
                                    <Link
                                        href="/wishlist"
                                        className="hidden sm:flex items-center px-4 hover-invert"
                                        aria-label="Wishlist"
                                    >
                                        <Heart className="w-4 h-4" />
                                    </Link>
                                    <Link
                                        href="/profile"
                                        className="flex items-center gap-2 px-4 bg-foreground text-background hover:bg-signal transition-colors"
                                    >
                                        <User className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline text-xs uppercase tracking-[0.15em]">
                                            {user.name?.split(" ")[0] || "Profile"}
                                        </span>
                                    </Link>
                                </>
                            ) : (
                                <Link
                                    href="/login"
                                    className="flex items-center px-5 bg-foreground text-background hover:bg-signal transition-colors text-xs uppercase tracking-[0.15em]"
                                >
                                    Sign&nbsp;In
                                </Link>
                            )}
                        </div>
                    </div>
                </header>
            </div>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-foreground pb-safe">
                <div className="flex items-center justify-around h-14 divide-x divide-border">
                    {[
                        { href: "/", label: "Home", icon: Home, active: pathname === "/" },
                        { href: "/shop", label: "Shop", icon: ShoppingBag, active: isActive("/shop") },
                        { href: "/community", label: "Forum", icon: Users, active: isActive("/community") },
                        {
                            href: user ? "/profile" : "/login",
                            label: user ? "Profile" : "Login",
                            icon: User,
                            active: isActive("/profile"),
                        },
                    ].map((item) => (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-full ${
                                item.active ? "bg-foreground text-background" : "text-muted-foreground"
                            }`}
                        >
                            <item.icon className="w-5 h-5" />
                            <span className="font-mono text-[9px] uppercase tracking-widest">{item.label}</span>
                        </Link>
                    ))}
                </div>
            </nav>
        </>
    )
}
