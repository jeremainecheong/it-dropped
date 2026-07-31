"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { User, Heart, Settings, LogOut, Bell, Shield, Globe } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"
import { useWishlist } from "@/lib/wishlist-context"
import { usePrefs } from "@/lib/prefs"
import { DESTINATIONS } from "@/lib/landed-cost"
import { supabase } from "@/lib/supabase"
import { AuthGuard } from "@/components/auth-guard"
import { Header } from "@/components/layout/header"

/**
 * Keys of user_profiles.notifications (migration 004). Only the two that a
 * producer actually exists for are exposed as controls — backend/internal/
 * database/alerts.go writes new_product notifications for drops and
 * price_drop/price_increase for price changes.
 */
type NotificationPrefs = Record<string, boolean>

const DEFAULT_PREFS: NotificationPrefs = {
    drops: true,
    // Migration 024. This is the fallback for a row we could not read, so it
    // has to match the column default — with the two disagreeing, the switch
    // showed off while the matcher sent, or the reverse.
    price_changes: true,
    // Vestigial: the forum this key was for is deleted, but the column default
    // (024) still carries it, and the fallback must keep matching the default.
    thread_replies: true,
}

const PREF_CONTROLS: { key: string; label: string; hint: string }[] = [
    { key: "drops", label: "Drop alerts", hint: "New products in your regions" },
    { key: "price_changes", label: "Price changes", hint: "Price drops and increases on items you watch" },
]

function ProfileContent() {
    const router = useRouter()
    const { user, logout } = useAuth()
    const { items: wishlistItems } = useWishlist()
    const { prefs: devicePrefs, setPrefs: setDevicePrefs, isReady: devicePrefsReady } = usePrefs()
    const [activeTab, setActiveTab] = useState<"wishlist" | "settings">("wishlist")
    const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS)
    const [prefsLoaded, setPrefsLoaded] = useState(false)
    const [savingPref, setSavingPref] = useState<string | null>(null)

    useEffect(() => {
        if (user) {
            fetchUserData()
        }
    }, [user])

    const fetchUserData = async () => {
        if (!user) return
        try {
            const profileRes = await supabase
                .from("user_profiles")
                .select("notifications")
                .eq("id", user.id)
                .maybeSingle()
            // supabase-js resolves on a PostgREST error rather than rejecting,
            // so a failed read here used to silently become DEFAULT_PREFS —
            // switches shown in the wrong position, and the next toggle writing
            // that wrong position back over the real row.
            if (profileRes.error) throw profileRes.error
            setPrefs({ ...DEFAULT_PREFS, ...(profileRes.data?.notifications ?? {}) })
            setPrefsLoaded(true)
        } catch (error) {
            console.error("Error:", error)
            // prefsLoaded stays false, so the switches render disabled rather
            // than claiming a state we failed to read.
            toast.error("Couldn't load your notification settings.")
        }
    }

    const togglePref = async (key: string, value: boolean) => {
        if (!user) return

        const previous = prefs
        const next = { ...prefs, [key]: value }
        setPrefs(next)
        setSavingPref(key)

        // user_profiles has an UPDATE policy but no INSERT policy (migration
        // 004), so the row must already exist — the signup trigger creates it.
        // Ask for the row back to tell a real save from an update that matched
        // nothing.
        const { data, error } = await supabase
            .from("user_profiles")
            .update({ notifications: next })
            .eq("id", user.id)
            .select("notifications")
            .maybeSingle()

        setSavingPref(null)

        if (error || !data) {
            setPrefs(previous)
            toast.error(error?.message || "Couldn't save your notification settings")
            return
        }
        setPrefs({ ...DEFAULT_PREFS, ...(data.notifications ?? {}) })
    }

    const handleLogout = async () => {
        await logout()
        router.push("/")
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    }

    const stats = {
        wishlist: wishlistItems.length,
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <Header />

            <main id="main" className="pt-14 max-w-4xl mx-auto px-4 lg:px-8 pb-nav">
                {/* Profile Header */}
                <div className="flex flex-col md:flex-row items-start md:items-center gap-6 pb-8 border-b border-border">
                    {/* Avatar. Initials rendered locally — the old fallback
                        fetched a generated avatar from dicebear.com seeded with
                        the account email, sending it to a third party on every
                        visit for a picture nobody chose. */}
                    {user?.avatar ? (
                        <img
                            src={user.avatar}
                            alt="Avatar"
                            className="w-24 h-24 lg:w-32 lg:h-32 rounded-full bg-muted"
                        />
                    ) : (
                        <div
                            aria-hidden
                            className="w-24 h-24 lg:w-32 lg:h-32 rounded-full bg-secondary flex items-center justify-center text-3xl lg:text-4xl font-medium text-muted-foreground"
                        >
                            {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
                        </div>
                    )}

                    {/* Info */}
                    <div className="flex-1">
                        <h1 className="text-2xl lg:text-3xl font-medium mb-1">{user?.name || "User"}</h1>
                        <div className="hairline-signal mb-2" />
                        <p className="text-muted-foreground mb-4">{user?.email}</p>
                        <div className="flex flex-wrap gap-6 text-sm">
                            <div>
                                <span className="num text-2xl font-medium">{stats.wishlist}</span>
                                <span className="text-muted-foreground ml-2">Saved</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-2 py-4 border-b border-border overflow-x-auto">
                    {[
                        { id: "wishlist", label: "Wishlist", icon: Heart },
                        { id: "settings", label: "Settings", icon: Settings },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`chip ${activeTab === tab.id ? "chip-on" : ""}`}
                        >
                            <tab.icon className="w-3.5 h-3.5" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="py-6">
                    {/* Wishlist Tab */}
                    {activeTab === "wishlist" && (
                        <div>
                            {wishlistItems.length === 0 ? (
                                <div className="text-center py-12">
                                    <Heart className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                                    <p className="text-muted-foreground">No saved items</p>
                                    <Link href="/shop" className="btn btn-primary mt-4">
                                        Browse Shop
                                    </Link>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {wishlistItems.slice(0, 6).map((item, index) => (
                                        <a
                                            key={item.id}
                                            href={item.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group animate-rise"
                                            // "both" so a delayed card holds the from-state instead
                                            // of flashing in before its turn.
                                            style={{ animationDelay: `${Math.min(index * 40, 200)}ms`, animationFillMode: "both" }}
                                        >
                                            <div className="card-lift card-frame aspect-[3/4] mb-2">
                                                <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                            </div>
                                            <h4 className="text-sm font-medium truncate">{item.name}</h4>
                                            <p className="num text-xs text-muted-foreground">{item.currency} {item.price}</p>
                                        </a>
                                    ))}
                                </div>
                            )}
                            {wishlistItems.length > 6 && (
                                <div className="text-center mt-6">
                                    <Link href="/wishlist" className="btn btn-ghost num">
                                        View all {wishlistItems.length} items →
                                    </Link>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Settings Tab */}
                    {activeTab === "settings" && (
                        <div>
                            {/* Each card is a ruled section: the uppercase label
                                does the naming, a .card-frame plate holds the
                                controls. The icons ride inside the labels. */}
                            <section className="section">
                                <div className="section-head">
                                    <h3 className="label flex items-center gap-1.5">
                                        <User className="w-3.5 h-3.5" /> Account
                                    </h3>
                                </div>
                                <div className="card-frame p-5 space-y-4 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Email</span>
                                        <span>{user?.email}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Name</span>
                                        <span>{user?.name || "Not set"}</span>
                                    </div>
                                </div>
                            </section>

                            {/* Preferences — the locale-inferred defaults, made
                                visible and editable in one place. Before this the
                                display currency had NO editing surface at all, the
                                destination hid on product pages, and sizes hid in
                                the shop nudge. Stored locally (lib/prefs), so this
                                card works for any visitor on this device. */}
                            <section className="section">
                                <div className="section-head">
                                    <h3 className="label flex items-center gap-1.5">
                                        <Globe className="w-3.5 h-3.5" /> Preferences
                                    </h3>
                                </div>
                                <div className="card-frame p-5 space-y-4 text-sm">
                                    <label className="flex items-center justify-between gap-4">
                                        <span>
                                            Show prices in
                                            <span className="block text-xs text-muted-foreground">Converted figures carry a ≈ — stores charge their own currency</span>
                                        </span>
                                        <select
                                            value={devicePrefs.displayCurrency}
                                            onChange={(e) => setDevicePrefs({ displayCurrency: e.target.value })}
                                            disabled={!devicePrefsReady}
                                            className="rounded-lg bg-secondary px-3 py-2 text-[13px] disabled:opacity-50"
                                        >
                                            <option value="native">Each store's own</option>
                                            {DESTINATIONS.map((d) => (
                                                <option key={d.currency + d.code} value={d.currency}>{d.currency}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="flex items-center justify-between gap-4">
                                        <span>
                                            Deliver to
                                            <span className="block text-xs text-muted-foreground">Sets the landed-cost estimate and which listing cards open</span>
                                        </span>
                                        <select
                                            value={devicePrefs.destination}
                                            onChange={(e) => setDevicePrefs({ destination: e.target.value })}
                                            disabled={!devicePrefsReady}
                                            className="rounded-lg bg-secondary px-3 py-2 text-[13px] disabled:opacity-50"
                                        >
                                            {DESTINATIONS.map((d) => (
                                                <option key={d.code} value={d.code}>{d.name}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <div>
                                        <span className="block mb-2">
                                            Your sizes
                                            <span className="block text-xs text-muted-foreground">Cards, drops and alerts flag anything in these</span>
                                        </span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {["XS", "S", "M", "L", "XL", "XXL", "28", "30", "32", "34", "36", "38", "OS"].map((sz) => (
                                                <button
                                                    key={sz}
                                                    type="button"
                                                    aria-pressed={devicePrefs.sizes.includes(sz)}
                                                    onClick={() =>
                                                        setDevicePrefs({
                                                            sizes: devicePrefs.sizes.includes(sz)
                                                                ? devicePrefs.sizes.filter((x) => x !== sz)
                                                                : [...devicePrefs.sizes, sz],
                                                        })
                                                    }
                                                    className={`chip min-w-9 justify-center ${devicePrefs.sizes.includes(sz) ? "chip-on" : ""}`}
                                                >
                                                    {sz}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Notifications */}
                            <section className="section">
                                <div className="section-head">
                                    <h3 className="label flex items-center gap-1.5">
                                        <Bell className="w-3.5 h-3.5" /> Notifications
                                    </h3>
                                </div>
                                <div className="card-frame p-5">
                                <div className="space-y-3 text-sm">
                                    {PREF_CONTROLS.map((control) => (
                                        <label key={control.key} className="flex items-center justify-between gap-4 cursor-pointer">
                                            <span>
                                                {control.label}
                                                <span className="block text-xs text-muted-foreground">{control.hint}</span>
                                            </span>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(prefs[control.key])}
                                                onChange={(e) => togglePref(control.key, e.target.checked)}
                                                disabled={!prefsLoaded || savingPref !== null}
                                                className="w-4 h-4 shrink-0 disabled:opacity-50"
                                            />
                                        </label>
                                    ))}
                                </div>

                                {/* /profile/alerts had no inbound link anywhere in the app. */}
                                {/* btn-secondary now works: the plate behind it is
                                    .card-frame on the page background, not --secondary. */}
                                <Link
                                    href="/profile/alerts"
                                    className="btn btn-sm btn-secondary mt-4"
                                >
                                    <Bell className="w-4 h-4" />
                                    Manage your alerts
                                </Link>
                                </div>
                            </section>

                            {/* Danger Zone */}
                            <section className="section">
                                <div className="section-head">
                                    <h3 className="label flex items-center gap-1.5">
                                        <Shield className="w-3.5 h-3.5" /> Danger Zone
                                    </h3>
                                </div>
                                <div className="card-frame p-5">
                                    {/* Bare .btn, no variant: variant colours are unlayered CSS
                                        and would beat the destructive utilities. */}
                                    <button
                                        onClick={handleLogout}
                                        className="btn btn-sm border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                    >
                                        Sign Out
                                    </button>
                                </div>
                            </section>
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}

export default function ProfilePage() {
    return (
        <AuthGuard>
            <ProfileContent />
        </AuthGuard>
    )
}
