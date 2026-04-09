"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { User, Heart, Home, ShoppingBag, Users, BarChart3 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { ThemeToggle } from "@/components/ui/theme-toggle"

interface HeaderProps {
    activePage?: "home" | "shop" | "community" | "dashboard" | "profile"
}

export function Header({ activePage }: HeaderProps) {
    const pathname = usePathname()
    const { user } = useAuth()

    const navLinks = [
        { href: "/shop", label: "Shop", icon: ShoppingBag },
        { href: "/community", label: "Community", icon: Users },
        { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
    ]

    const isActive = (href: string) => {
        if (activePage) return href === `/${activePage}`
        return pathname === href || pathname.startsWith(href + "/")
    }

    return (
        <>
            {/* Desktop Header */}
            <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="flex items-center justify-between px-4 lg:px-8 h-14">
                    {/* Logo */}
                    <Link href="/" className="text-lg font-medium tracking-tight uppercase shrink-0">
                        it dropped<span className="text-muted-foreground">!</span>
                    </Link>

                    {/* Desktop Nav */}
                    <nav className="hidden md:flex items-center gap-6">
                        {navLinks.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`text-sm tracking-wide transition-colors ${isActive(link.href)
                                        ? "bg-foreground text-background px-3 py-1"
                                        : "text-muted-foreground hover:text-foreground"
                                    }`}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>

                    {/* Right Actions */}
                    <div className="flex items-center gap-2">
                        <ThemeToggle />

                        {user ? (
                            <>
                                <Link href="/wishlist" className="hidden sm:flex p-2 hover:bg-muted rounded transition-colors">
                                    <Heart className="w-4 h-4" />
                                </Link>
                                <Link
                                    href="/profile"
                                    className="flex items-center gap-2 px-3 py-1.5 bg-foreground text-background text-xs tracking-wide hover:bg-foreground/90 transition-colors"
                                >
                                    <User className="w-3 h-3" />
                                    <span className="hidden sm:inline">{user.name?.split(" ")[0] || "Profile"}</span>
                                </Link>
                            </>
                        ) : (
                            <Link
                                href="/login"
                                className="px-4 py-1.5 bg-foreground text-background text-xs tracking-wide hover:bg-foreground/90 transition-colors"
                            >
                                Sign In
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border pb-safe">
                <div className="flex items-center justify-around h-14">
                    <Link href="/" className={`flex flex-col items-center gap-0.5 p-2 ${pathname === "/" ? "text-foreground" : "text-muted-foreground"}`}>
                        <Home className="w-5 h-5" />
                        <span className="text-[10px]">Home</span>
                    </Link>
                    <Link href="/shop" className={`flex flex-col items-center gap-0.5 p-2 ${isActive("/shop") ? "text-foreground" : "text-muted-foreground"}`}>
                        <ShoppingBag className="w-5 h-5" />
                        <span className="text-[10px]">Shop</span>
                    </Link>
                    <Link href="/community" className={`flex flex-col items-center gap-0.5 p-2 ${isActive("/community") ? "text-foreground" : "text-muted-foreground"}`}>
                        <Users className="w-5 h-5" />
                        <span className="text-[10px]">Forum</span>
                    </Link>
                    <Link href={user ? "/profile" : "/login"} className={`flex flex-col items-center gap-0.5 p-2 ${isActive("/profile") ? "text-foreground" : "text-muted-foreground"}`}>
                        <User className="w-5 h-5" />
                        <span className="text-[10px]">{user ? "Profile" : "Login"}</span>
                    </Link>
                </div>
            </nav>
        </>
    )
}
