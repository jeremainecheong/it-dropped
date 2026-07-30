"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { User, Heart, MessageCircle, Settings, LogOut, ArrowLeft, Edit2, Bell, Shield, Moon, Sun } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useWishlist } from "@/lib/wishlist-context"
import { supabase } from "@/lib/supabase"
import { AuthGuard } from "@/components/auth-guard"
import { Header } from "@/components/layout/header"

interface UserActivity {
    type: "thread" | "comment" | "like"
    title: string
    created_at: string
}

function ProfileContent() {
    const router = useRouter()
    const { user, logout } = useAuth()
    const { items: wishlistItems } = useWishlist()
    const [activeTab, setActiveTab] = useState<"activity" | "wishlist" | "settings">("activity")
    const [threads, setThreads] = useState<any[]>([])
    const [comments, setComments] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (user) {
            fetchUserData()
        }
    }, [user])

    const fetchUserData = async () => {
        if (!user) return
        setIsLoading(true)
        try {
            const [threadsRes, commentsRes] = await Promise.all([
                supabase.from("forum_threads").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
                supabase.from("forum_comments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
            ])
            setThreads(threadsRes.data || [])
            setComments(commentsRes.data || [])
        } catch (error) {
            console.error("Error:", error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleLogout = async () => {
        await logout()
        router.push("/")
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    }

    const formatTimeAgo = (dateString: string) => {
        const date = new Date(dateString)
        const now = new Date()
        const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
        if (diff < 60) return "just now"
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
        return `${Math.floor(diff / 86400)}d ago`
    }

    const stats = {
        threads: threads.length,
        comments: comments.length,
        wishlist: wishlistItems.length,
        likes: threads.reduce((acc, t) => acc + (t.like_count || 0), 0),
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <Header />

            <main className="pt-14 max-w-4xl mx-auto px-4 lg:px-8 pb-nav">
                {/* Profile Header */}
                <div className="flex flex-col md:flex-row items-start md:items-center gap-6 pb-8 border-b border-border">
                    {/* Avatar */}
                    <div className="relative">
                        <img
                            src={user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`}
                            alt="Avatar"
                            className="w-24 h-24 lg:w-32 lg:h-32 rounded-full bg-muted"
                        />
                        <button className="absolute bottom-0 right-0 p-2 bg-foreground text-background rounded-full hover:bg-foreground/90 transition-colors">
                            <Edit2 className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                        <h1 className="text-2xl lg:text-3xl font-medium mb-1">{user?.name || "User"}</h1>
                        <p className="text-muted-foreground mb-4">{user?.email}</p>
                        <div className="flex flex-wrap gap-6 text-sm">
                            <div>
                                <span className="text-2xl font-medium">{stats.threads}</span>
                                <span className="text-muted-foreground ml-2">Threads</span>
                            </div>
                            <div>
                                <span className="text-2xl font-medium">{stats.comments}</span>
                                <span className="text-muted-foreground ml-2">Comments</span>
                            </div>
                            <div>
                                <span className="text-2xl font-medium">{stats.wishlist}</span>
                                <span className="text-muted-foreground ml-2">Saved</span>
                            </div>
                            <div>
                                <span className="text-2xl font-medium">{stats.likes}</span>
                                <span className="text-muted-foreground ml-2">Likes</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 py-4 border-b border-border overflow-x-auto">
                    {[
                        { id: "activity", label: "Activity", icon: MessageCircle },
                        { id: "wishlist", label: "Wishlist", icon: Heart },
                        { id: "settings", label: "Settings", icon: Settings },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors whitespace-nowrap ${activeTab === tab.id
                                ? "bg-foreground text-background"
                                : "hover:bg-muted"
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="py-6">
                    {/* Activity Tab */}
                    {activeTab === "activity" && (
                        <div className="space-y-6">
                            {isLoading ? (
                                <div className="space-y-4">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="p-4 border border-border animate-pulse">
                                            <div className="h-4 bg-muted w-3/4 mb-2" />
                                            <div className="h-3 bg-muted w-1/2" />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <>
                                    {/* Threads */}
                                    {threads.length > 0 && (
                                        <div>
                                            <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Your Threads</h3>
                                            <div className="space-y-3">
                                                {threads.map((thread) => (
                                                    <Link
                                                        key={thread.id}
                                                        href={`/community/${thread.id}`}
                                                        className="block p-4 border border-border hover:border-foreground/50 transition-colors"
                                                    >
                                                        <h4 className="font-medium mb-1">{thread.title}</h4>
                                                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                            <span>{formatTimeAgo(thread.created_at)}</span>
                                                            <span className="flex items-center gap-1">
                                                                <MessageCircle className="w-3 h-3" /> {thread.comment_count}
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <Heart className="w-3 h-3" /> {thread.like_count}
                                                            </span>
                                                        </div>
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Comments */}
                                    {comments.length > 0 && (
                                        <div>
                                            <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Your Comments</h3>
                                            <div className="space-y-3">
                                                {comments.map((comment) => (
                                                    <Link
                                                        key={comment.id}
                                                        href={`/community/${comment.thread_id}`}
                                                        className="block p-4 border border-border hover:border-foreground/50 transition-colors"
                                                    >
                                                        <p className="text-sm line-clamp-2 mb-2">{comment.content}</p>
                                                        <span className="text-xs text-muted-foreground">{formatTimeAgo(comment.created_at)}</span>
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {threads.length === 0 && comments.length === 0 && (
                                        <div className="text-center py-12">
                                            <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                                            <p className="text-muted-foreground">No activity yet</p>
                                            <Link href="/community/new" className="inline-block mt-4 px-6 py-2 bg-foreground text-background text-sm">
                                                Start a Thread
                                            </Link>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Wishlist Tab */}
                    {activeTab === "wishlist" && (
                        <div>
                            {wishlistItems.length === 0 ? (
                                <div className="text-center py-12">
                                    <Heart className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                                    <p className="text-muted-foreground">No saved items</p>
                                    <Link href="/shop" className="inline-block mt-4 px-6 py-2 bg-foreground text-background text-sm">
                                        Browse Shop
                                    </Link>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {wishlistItems.slice(0, 6).map((item) => (
                                        <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="group">
                                            <div className="aspect-[3/4] bg-muted mb-2 overflow-hidden">
                                                <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                            </div>
                                            <h4 className="text-sm font-medium truncate">{item.name}</h4>
                                            <p className="text-xs text-muted-foreground">{item.currency} {item.price}</p>
                                        </a>
                                    ))}
                                </div>
                            )}
                            {wishlistItems.length > 6 && (
                                <Link href="/wishlist" className="block text-center mt-6 text-sm text-muted-foreground hover:text-foreground">
                                    View all {wishlistItems.length} items →
                                </Link>
                            )}
                        </div>
                    )}

                    {/* Settings Tab */}
                    {activeTab === "settings" && (
                        <div className="space-y-6">
                            {/* Account */}
                            <div className="p-4 border border-border">
                                <h3 className="flex items-center gap-2 text-sm font-medium mb-4">
                                    <User className="w-4 h-4" /> Account
                                </h3>
                                <div className="space-y-4 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Email</span>
                                        <span>{user?.email}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Name</span>
                                        <span>{user?.name || "Not set"}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Notifications */}
                            <div className="p-4 border border-border">
                                <h3 className="flex items-center gap-2 text-sm font-medium mb-4">
                                    <Bell className="w-4 h-4" /> Notifications
                                </h3>
                                <div className="space-y-3 text-sm">
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <span>Drop alerts</span>
                                        <input type="checkbox" defaultChecked className="w-4 h-4" />
                                    </label>
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <span>Price changes</span>
                                        <input type="checkbox" className="w-4 h-4" />
                                    </label>
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <span>Thread replies</span>
                                        <input type="checkbox" defaultChecked className="w-4 h-4" />
                                    </label>
                                </div>
                            </div>

                            {/* Danger Zone */}
                            <div className="p-4 border border-destructive/30">
                                <h3 className="flex items-center gap-2 text-sm font-medium text-destructive mb-4">
                                    <Shield className="w-4 h-4" /> Danger Zone
                                </h3>
                                <button
                                    onClick={handleLogout}
                                    className="px-4 py-2 border border-destructive text-destructive text-sm hover:bg-destructive hover:text-destructive-foreground transition-colors"
                                >
                                    Sign Out
                                </button>
                            </div>
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
